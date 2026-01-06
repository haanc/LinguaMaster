
import requests
import uuid
import datetime

BASE_URL = "http://127.0.0.1:8000"

def test_srs_flow():
    # 1. Create a Word
    word_id = str(uuid.uuid4())
    print(f"Creating word with ID: {word_id}...")
    
    payload = {
        # "id": word_id, # Let backend gen ID
        "word": "TestSRS",
        # "context_sentence": "SRS verification.",
        # "translation": "Test",
        "language": "en"
    }
    
    res = requests.post(f"{BASE_URL}/vocab", json=payload)
    if res.status_code != 200:
        print(f"Failed to save word: {res.text}")
        return
    print("Word saved.")
    
    # 2. Verify Initial State
    res = requests.get(f"{BASE_URL}/vocab", params={"language": "en"})
    words = res.json()
    my_word = next((w for w in words if w["id"] == word_id), None)
    
    if not my_word:
        print("Error: Word not found in list.")
        return
        
    print(f"Initial State: interval={my_word.get('interval')}, reps={my_word.get('repetitions')}")
    
    # 3. Perform Review (Grade: Good = 4)
    print("Performing Review (Good)...")
    res = requests.post(f"{BASE_URL}/vocab/{word_id}/review", json={"quality": 4})
    if res.status_code != 200:
        print(f"Review failed: {res.text}")
        return
        
    updated_word = res.json()
    print(f"Post-Review: interval={updated_word['interval']}, reps={updated_word['repetitions']}, next_review={updated_word['next_review_at'][:10]}")
    
    # Verify SM-2 Logic (First Rep, Good) -> Interval should be 1 repeating
    # Actually SM-2: Rep=1 -> I=1, Rep=2 -> I=6
    
    # Let's do a second review to see spread
    print("Performing Second Review (Good)...")
    res = requests.post(f"{BASE_URL}/vocab/{word_id}/review", json={"quality": 4})
    updated_word = res.json()
    print(f"Post-Review 2: interval={updated_word['interval']}, reps={updated_word['repetitions']}")

    # 4. Clean up
    requests.delete(f"{BASE_URL}/vocab/{word_id}")
    print("Test Complete.")

if __name__ == "__main__":
    try:
        test_srs_flow()
    except Exception as e:
        print(f"Test failed with exception: {e}")
