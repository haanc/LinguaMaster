import os
from sqlmodel import create_engine, SQLModel, Session
import models # Removed relative import

# Support custom database path from environment variable (for packaged app)
# Falls back to local sqlite file in the backend directory
database_path = os.environ.get('DATABASE_PATH')

if database_path:
    # Use the path from environment variable
    sqlite_file_name = database_path
    # Ensure directory exists
    os.makedirs(os.path.dirname(sqlite_file_name), exist_ok=True)
else:
    # Use local file relative to this script
    base_dir = os.path.dirname(os.path.abspath(__file__))
    sqlite_file_name = os.path.join(base_dir, "learning.db")

sqlite_url = f"sqlite:///{sqlite_file_name}"

engine = create_engine(sqlite_url, echo=True)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
