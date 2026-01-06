
from sqlmodel import Session, text
from database import engine

def migrate():
    with Session(engine) as session:
        print("Starting Migration...")
        try:
            # 1. Add language
            session.exec(text("ALTER TABLE savedword ADD COLUMN language VARCHAR DEFAULT 'en'"))
            print("Added language column")
        except Exception as e:
            print(f"Skipping language (maybe exists): {e}")

        try:
            # 2. Add next_review_at
            # SQLite doesn't strictly support DATETIME type same way, but usually TEXT or REAL
            # SQLModel uses DATETIME, in SQLite it's usually valid
            session.exec(text("ALTER TABLE savedword ADD COLUMN next_review_at DATETIME"))
            print("Added next_review_at column")
        except Exception as e:
            print(f"Skipping next_review_at: {e}")

        try:
            # 3. Add interval
            session.exec(text("ALTER TABLE savedword ADD COLUMN interval FLOAT DEFAULT 0.0"))
            print("Added interval column")
        except Exception as e:
            print(f"Skipping interval: {e}")

        try:
            # 4. Add easiness_factor
            session.exec(text("ALTER TABLE savedword ADD COLUMN easiness_factor FLOAT DEFAULT 2.5"))
            print("Added easiness_factor column")
        except Exception as e:
            print(f"Skipping easiness_factor: {e}")

        try:
            # 5. Add repetitions
            session.exec(text("ALTER TABLE savedword ADD COLUMN repetitions INTEGER DEFAULT 0"))
            print("Added repetitions column")
        except Exception as e:
            print(f"Skipping repetitions: {e}")

        try:
            # 6. Add owner_id to savedword
            session.exec(text("ALTER TABLE savedword ADD COLUMN owner_id VARCHAR DEFAULT 'guest'"))
            session.exec(text("CREATE INDEX ix_savedword_owner_id ON savedword (owner_id)"))
            print("Added owner_id to savedword")
        except Exception as e:
            print(f"Skipping owner_id (savedword): {e}")

        try:
            # 7. Add owner_id to mediasource
            session.exec(text("ALTER TABLE mediasource ADD COLUMN owner_id VARCHAR DEFAULT 'guest'"))
            session.exec(text("CREATE INDEX ix_mediasource_owner_id ON mediasource (owner_id)"))
            print("Added owner_id to mediasource")
        except Exception as e:
            print(f"Skipping owner_id (mediasource): {e}")
            
        session.commit()
        print("Migration Complete.")

if __name__ == "__main__":
    migrate()
