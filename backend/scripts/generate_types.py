#!/usr/bin/env python3
"""
Type Generator Script
Generates TypeScript interfaces from Python Pydantic/SQLModel models.

Usage: python scripts/generate_types.py
Output: ../src/types/generated.ts
"""

import os
import sys
from pathlib import Path
from datetime import datetime
from typing import get_type_hints, get_origin, get_args, Union, Optional, List
from uuid import UUID

# Add backend to path
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from models import MediaSource, SubtitleSegment, SavedWord

# Type mapping from Python to TypeScript
TYPE_MAP = {
    str: "string",
    int: "number",
    float: "number",
    bool: "boolean",
    UUID: "string",
    datetime: "string",  # ISO format
    type(None): "null",
}

def python_type_to_ts(py_type) -> str:
    """Convert Python type annotation to TypeScript type."""
    # Handle Optional[X] -> X | undefined (TypeScript idiom)
    origin = get_origin(py_type)

    if origin is Union:
        args = get_args(py_type)
        # Check for Optional (Union with None)
        non_none_args = [a for a in args if a is not type(None)]
        if len(non_none_args) == 1 and type(None) in args:
            # This is Optional[X] -> use undefined for TS compatibility
            return f"{python_type_to_ts(non_none_args[0])}"  # Just the type, marked optional with ?
        else:
            return " | ".join(python_type_to_ts(a) for a in args if a is not type(None))

    if origin is list or origin is List:
        args = get_args(py_type)
        if args:
            return f"{python_type_to_ts(args[0])}[]"
        return "any[]"

    # Direct type lookup
    if py_type in TYPE_MAP:
        return TYPE_MAP[py_type]

    # Fallback
    return "any"

def generate_interface(model_class) -> str:
    """Generate TypeScript interface from a Pydantic/SQLModel class."""
    lines = [f"export interface {model_class.__name__} {{"]

    # Get field annotations
    hints = get_type_hints(model_class)

    # Get field info for defaults/optional detection
    fields = {}
    if hasattr(model_class, 'model_fields'):
        fields = model_class.model_fields
    elif hasattr(model_class, '__fields__'):
        fields = model_class.__fields__

    # Fields to skip (SQLModel internals and relationships)
    SKIP_FIELDS = {
        'segments', 'media',  # Relationship fields
        '__tablename__', '__sqlmodel_relationships__', '__name__',
        'metadata', 'model_config', 'model_fields',
    }

    # Required fields that should not be optional in responses
    REQUIRED_FIELDS = {'id', 'title', 'word', 'text', 'index', 'start_time', 'end_time'}

    # Fields that should use enum types
    ENUM_FIELDS = {'status': 'MediaStatus'}

    for field_name, field_type in hints.items():
        # Skip internal and relationship fields
        if field_name in SKIP_FIELDS or field_name.startswith('_'):
            continue

        # Check if field is Optional (has None in Union)
        origin = get_origin(field_type)
        is_optional_type = False
        if origin is Union:
            args = get_args(field_type)
            if type(None) in args:
                is_optional_type = True

        # Use enum type if defined
        if field_name in ENUM_FIELDS:
            ts_type = ENUM_FIELDS[field_name]
        else:
            ts_type = python_type_to_ts(field_type)

        # Determine if field is optional
        is_optional = is_optional_type

        # Required fields are never optional (in API responses)
        if field_name in REQUIRED_FIELDS:
            is_optional = False

        optional_marker = "?" if is_optional else ""
        lines.append(f"  {field_name}{optional_marker}: {ts_type};")

    lines.append("}")
    return "\n".join(lines)

def generate_status_enum() -> str:
    """Generate MediaStatus enum for stricter typing."""
    return '''export type MediaStatus =
  | 'pending'
  | 'downloading'
  | 'processing_audio'
  | 'transcribing'
  | 'ready'
  | 'error'
  | 'cloud_only';'''

def main():
    output_lines = [
        "// Auto-generated TypeScript types from Python models",
        f"// Generated at: {datetime.now().isoformat()}",
        "// Do not edit manually - regenerate with: python backend/scripts/generate_types.py",
        "",
        generate_status_enum(),
        "",
    ]

    models = [MediaSource, SubtitleSegment, SavedWord]

    for model in models:
        output_lines.append(generate_interface(model))
        output_lines.append("")

    output_content = "\n".join(output_lines)

    # Write to src/types/generated.ts
    output_path = backend_dir.parent / "src" / "types" / "generated.ts"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output_content)

    print(f"Generated types at: {output_path}")
    print(output_content)

if __name__ == "__main__":
    main()
