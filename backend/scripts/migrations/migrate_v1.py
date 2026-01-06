
from database import engine
from sqlmodel import text

def migrate():
    print("Starting migration...")
    with engine.connect() as conn:
        try:
            # Add status column
            conn.execute(text("ALTER TABLE mediasource ADD COLUMN status VARCHAR DEFAULT 'ready'"))
            print("Added status column.")
        except Exception as e:
            print(f"Status column may already exist: {e}")

        try:
            # Add error_message column
            conn.execute(text("ALTER TABLE mediasource ADD COLUMN error_message VARCHAR"))
            print("Added error_message column.")
        except Exception as e:
            print(f"error_message column may already exist: {e}")
            
        try:
            # Add cover_image column
            conn.execute(text("ALTER TABLE mediasource ADD COLUMN cover_image VARCHAR"))
            print("Added cover_image column.")
        except Exception as e:
            print(f"cover_image column may already exist: {e}")

        conn.commit()
    print("Migration complete.")

if __name__ == "__main__":
    migrate()
