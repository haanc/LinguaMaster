
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ai_service import ai_service
from ai.core import get_llm

def test_config():
    try:
        llm = get_llm()
        print(f"LLM Configured: {type(llm)}")
    except Exception as e:
        print(f"LLM Config Error: {e}")

def test_dictionary():
    print("\n--- Testing Dictionary Agent (Target: Spanish) ---")
    res = ai_service.lookup_word("orchestrator", "The AI agent orchestrator manages the workflow.", target_language="Spanish")
    print("Result:", res)

def test_chat():
    print("\n--- Testing Tutor Graph ---")
    res = ai_service.chat_with_tutor([{"role": "user", "content": "Hello, who are you?"}])
    print("Result:", res)

if __name__ == "__main__":
    if not ai_service.dictionary_chain:
        print("LangChain not initialized. Check logs.")
    else:    
        test_config()
        test_dictionary()
        test_chat()
