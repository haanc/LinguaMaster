
import requests
import json
import uuid

BASE_URL = "http://localhost:8000"

def test_vocab_api():
    print("Testing Vocab API...")
    
    # 1. List (Should be empty or existing)
    res = requests.get(f"{BASE_URL}/vocab")
    print(f"List Status: {res.status_code}")
    initial_count = len(res.json())
    print(f"Initial Count: {initial_count}")

    # 2. Add Word
    payload = {
        "word": "Serendipity",
        "context_sentence": "Finding this library was pure serendipity.",
        "translation": "机缘巧合"
    }
    # input("Press Enter to POST word...")
    
    res = requests.post(f"{BASE_URL}/vocab", json=payload)
    print(f"Post Status: {res.status_code}")
    if res.status_code == 200:
        data = res.json()
        print(f"Added: {data}")
        new_id = data['id']

        # 3. List Again
        res = requests.get(f"{BASE_URL}/vocab")
        print(f"New Count: {len(res.json())}")
        
        # 4. Delete
        # input(f"Press Enter to DELETE {new_id}...")
        res = requests.delete(f"{BASE_URL}/vocab/{new_id}")
        print(f"Delete Status: {res.status_code}")
        
        # 5. List Verify
        res = requests.get(f"{BASE_URL}/vocab")
        print(f"Final Count: {len(res.json())}")
    else:
        print("Failed to add word.")
        print(res.text)

if __name__ == "__main__":
    test_vocab_api()
