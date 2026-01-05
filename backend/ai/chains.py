
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.runnables import Runnable
from pydantic import BaseModel, Field
from .core import get_llm

class VocabularyItem(BaseModel):
    word: str = Field(description="The source word or phrase being defined")
    definition: str = Field(description="Clear, concise definition in the target language")
    pronunciation: str = Field(description="IPA pronunciation")
    translation: str = Field(description="Direct translation of the word into the target language")
    example_sentence: str = Field(description="An example sentence using the word (monolingual or bilingual as appropriate)")
    
def get_dictionary_chain() -> Runnable:
    llm = get_llm(temperature=0.3)
    
    parser = PydanticOutputParser(pydantic_object=VocabularyItem)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful language tutor. You provide clear definitions and examples for language learners. Output strict JSON."),
        ("user", "Define the term (word or phrase) '{word}' from the context sentence: '{context_sentence}'.\nTarget Language: {target_language}.\n\n{format_instructions}")
    ])
    
    return prompt.partial(format_instructions=parser.get_format_instructions()) | llm | parser

class ContextExplanation(BaseModel):
    summary: str = Field(description="Brief summary of the meaning in target language")
    grammar_notes: str = Field(description="Key grammar points observed, explained in target language")
    cultural_notes: str = Field(description="Any cultural context or slang, explained in target language")

def get_context_chain() -> Runnable:
    llm = get_llm(temperature=0.7)
    parser = PydanticOutputParser(pydantic_object=ContextExplanation)

    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert language teacher. Analyze the given subtitle text for grammar and cultural nuance."),
        ("user", "Analyze this text: '{subtitle_text}'.\nExplain in: {target_language}.\n\n{format_instructions}")
    ])

    return prompt.partial(format_instructions=parser.get_format_instructions()) | llm | parser


class VocabularyItemAugmented(BaseModel):
    """Vocabulary item with sentence translation provided - extract word translation from context."""
    word: str = Field(description="The source word or phrase being defined")
    definition: str = Field(description="Clear, concise definition in the target language")
    pronunciation: str = Field(description="IPA pronunciation")
    word_translation: str = Field(description="The translation of THIS SPECIFIC word/phrase extracted from or inferred from the sentence translation")
    example_sentence: str = Field(description="An example sentence using the word")


def get_augmented_dictionary_chain() -> Runnable:
    """
    A chain for when we already have the sentence translation.
    Uses the sentence translation to help extract the specific word's translation.
    This is faster because the AI has context from the translation.
    """
    llm = get_llm(temperature=0.3)

    parser = PydanticOutputParser(pydantic_object=VocabularyItemAugmented)

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a helpful language tutor. You are given a word/phrase along with its source sentence AND the sentence's translation.
Your job is to:
1. Provide a clear definition for the word
2. Provide IPA pronunciation
3. Extract or infer the translation of the SPECIFIC word/phrase from the sentence translation
4. Provide an example sentence

Output strict JSON."""),
        ("user", """Word/Phrase: '{word}'
Original sentence: '{context_sentence}'
Sentence translation: '{sentence_translation}'
Target Language: {target_language}

Based on the sentence translation, extract or infer the translation of '{word}' specifically.

{format_instructions}""")
    ])

    return prompt.partial(format_instructions=parser.get_format_instructions()) | llm | parser
