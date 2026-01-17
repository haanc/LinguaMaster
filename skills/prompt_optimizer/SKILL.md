---
name: prompt_optimizer
description: Analyze and refine user prompts to improve LLM performance using best practices like CO-STAR, few-shot, and chain-of-thought.
---

# Prompt Optimizer Skill

This skill guides you in helping users refine their prompts to get the best possible results from Large Language Models (LLMs).

## When to use this skill
Use this skill when:
- The user explicitly asks to "optimize", "refine", or "improve" a prompt.
- The user provides a vague or ambiguous request and asks for help making it better.
- The user wants to convert a simple instruction into a structured, high-performance prompt.

## Optimization Framework (CO-STAR)

When optimizing a prompt, try to structure specific sections for:

1.  **C (Context)**: Background information, user persona, and scenario.
2.  **O (Objective)**: Clear definition of what needs to be done.
3.  **S (Style)**: The tone, voice, and writing style (e.g., authoritative, friendly, concise).
4.  **T (Tone)**: Emotional inflection (e.g., empathetic, professional).
5.  **A (Audience)**: Who is the output for? (e.g., beginners, experts, functionality).
6.  **R (Response)**: Format of the output (e.g., JSON, Markdown table, Python code).

## Process

1.  **Analyze**: Read the user's current draft or intent. Identify missing context, ambiguous constraints, or weak instructions.
2.  **Structure**: Apply a structured format (like the CO-STAR framework or the template below).
3.  **Refine**: Add "Chain of Thought" instructions ("Think step by step...") if logic is required. Add delimiters (```) to separate data from instructions.
4.  **Output**: usage the `templates/structured_prompt.md` layout to present the result.
5.  **Explain**: Briefly explain *why* the changes improve the prompt (e.g., "Added delimiters to prevent prompt injection," "Specified JSON format for easier parsing").

## Checklist for a Great Prompt
- [ ] **Role/Persona**: Does it say who the AI should be?
- [ ] **Task**: Is the active verb clear? (e.g., "Write," "Classify," "Summarize")
- [ ] **Constraints**: Are there word counts, forbidden topics, or mandatory inclusions?
- [ ] **Format**: Is the output format explicitly defined?
- [ ] **Examples (Few-Shot)**: Are there input-output pairs to guide the model?

## Example Output

"Here is the optimized version of your prompt:"

```markdown
# Role
You are an expert Copywriter specialized in SaaS landing pages.

# Objective
Write a hero section headline and subheadline for a new project management tool.

# Audience
Small business owners who are overwhelmed by complex enterprise software.

# Context
The product is "TaskFlow". It focuses on simplicity and speed.

# Constraints
- Headline: Max 8 words. Punchy.
- Subheadline: Max 20 words. Focus on relief and ease.
- No jargon.

# Output Format
Provide 3 variations in a bulleted list.
```
