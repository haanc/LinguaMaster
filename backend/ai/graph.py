
from typing import List, TypedDict, Annotated, Dict, Any
from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from .core import get_llm

class TutorState(TypedDict):
    messages: List[BaseMessage]
    context_text: str
    target_language: str

def chatbot(state: TutorState):
    llm = get_llm(temperature=0.7)

    # Prepend context to the first message if it's the start, or inject as system.
    # For simplicity, we just pass messages. A more robust way is to make a system message
    # using state['context_text'].

    messages = state['messages']
    context_text = state.get('context_text', '')
    target_language = state.get('target_language', 'Chinese')

    # Create a system prompt that sets the persona and context
    system_prompt_content = (
        f"You are a strict language tutor assistant. Your SOLE purpose is to help the user understand the specific text provided below:\n"
        f"\"\"\"{context_text}\"\"\"\n\n"
        f"Instructions:\n"
        f"1. IF the question is about the vocabulary, grammar, meaning, or cultural context of the text above, answer clearly and concisely in {target_language}.\n"
        f"2. IF the question is UNRELATED to the text (e.g., general knowledge, coding, completely different topics), do NOT answer it.\n"
        f"   Instead, politely reply (in {target_language}): \"I can only answer questions related to the selected text. Please use other tools for general inquiries.\"\n"
        f"3. Always keep your answers focused on the provided text."
    )

    system_message = SystemMessage(content=system_prompt_content)

    # Prepare messages for LLM: System Message + Conversation History
    llm_messages = [system_message] + messages

    response = llm.invoke(llm_messages)
    return {"messages": [response]}

def create_tutor_graph():
    workflow = StateGraph(TutorState)

    workflow.add_node("chatbot", chatbot)
    workflow.set_entry_point("chatbot")
    workflow.add_edge("chatbot", END)

    return workflow.compile()
