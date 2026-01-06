"""
AI Service Module
Provides high-level AI functionality using abstracted providers.
"""

from typing import List, Dict, Any, Optional

# Provider imports
from ai.providers import get_whisper_provider, WhisperProvider
from ai.config import get_config

# LangChain imports
try:
    from ai.chains import get_dictionary_chain, get_context_chain, get_augmented_dictionary_chain
    from ai.graph import create_tutor_graph
    LANGCHAIN_AVAILABLE = True
except ImportError:
    print("WARN: LangChain dependencies not found. AI features may be limited.")
    LANGCHAIN_AVAILABLE = False


class AIService:
    """
    High-level AI service that orchestrates different AI capabilities.
    Uses provider abstraction for LLM and Whisper services.
    """

    def __init__(self):
        self.config = get_config()

        # Initialize Whisper provider
        try:
            self._whisper_provider: Optional[WhisperProvider] = get_whisper_provider(self.config)
        except Exception as e:
            print(f"WARNING: Failed to initialize Whisper provider: {e}")
            self._whisper_provider = None

        # Initialize LangChain components
        self.dictionary_chain = None
        self.augmented_dictionary_chain = None
        self.context_chain = None
        self.tutor_graph = None

        if LANGCHAIN_AVAILABLE:
            try:
                self.dictionary_chain = get_dictionary_chain()
                self.augmented_dictionary_chain = get_augmented_dictionary_chain()
                self.context_chain = get_context_chain()
                self.tutor_graph = create_tutor_graph()
                print("LangChain Agents initialized successfully.")
            except Exception as e:
                print(f"ERROR: Failed to initialize LangChain Agents: {e}")

    @property
    def whisper_provider(self) -> Optional[WhisperProvider]:
        return self._whisper_provider

    def transcribe_audio(self, audio_path: str) -> List[Dict[str, Any]]:
        """
        Transcribes the given audio file using the configured Whisper provider.
        Returns a list of segment dictionaries compatible with SubtitleSegment.
        """
        if not self._whisper_provider:
            raise ValueError("Whisper provider not initialized. Check your .env configuration.")

        print(f"Transcribing: {audio_path}")
        segments = self._whisper_provider.transcribe(audio_path)

        # Convert to dict format for API compatibility
        return [seg.to_dict() for seg in segments]

    def lookup_word(
        self,
        word: str,
        context_sentence: str,
        target_language: str = "English",
        sentence_translation: str = None,
    ) -> Dict[str, Any]:
        """
        Analyzes a word in context using LangChain DictionaryAgent.

        If sentence_translation is provided, uses the augmented chain (faster, fewer tokens)
        and extracts the word translation from the sentence translation.
        Otherwise, uses the full dictionary chain.
        """
        # Use augmented chain if we have translation context
        if sentence_translation and self.augmented_dictionary_chain:
            try:
                result = self.augmented_dictionary_chain.invoke({
                    "word": word,
                    "context_sentence": context_sentence,
                    "sentence_translation": sentence_translation,
                    "target_language": target_language,
                })
                result_dict = result.model_dump()
                result_dict["translation"] = result_dict.pop("word_translation", sentence_translation)
                return result_dict
            except Exception as e:
                print(f"Error in augmented lookup_word: {e}, falling back to full chain")

        # Full chain (no translation context available)
        if not self.dictionary_chain:
            return {"error": "AI Service not initialized"}

        try:
            result = self.dictionary_chain.invoke({
                "word": word,
                "context_sentence": context_sentence,
                "target_language": target_language,
            })
            return result.model_dump()
        except Exception as e:
            print(f"Error in lookup_word: {e}")
            return {"error": str(e)}

    def explain_context(
        self, subtitle_text: str, target_language: str = "English"
    ) -> Dict[str, Any]:
        """
        Explains grammar/culture using LangChain ContextExplainer.
        """
        if not self.context_chain:
            return {"error": "AI Service not initialized"}

        try:
            result = self.context_chain.invoke({
                "subtitle_text": subtitle_text,
                "target_language": target_language,
            })
            return result.model_dump()
        except Exception as e:
            print(f"Error in explain_context: {e}")
            return {"error": str(e)}

    def chat_with_tutor(
        self,
        messages: List[Dict[str, str]],
        context_text: Optional[str] = None,
        target_language: str = "Chinese",
    ) -> Dict[str, Any]:
        """
        Runs the LangGraph tutor workflow.
        Input messages: [{"role": "user", "content": "..."}]
        """
        if not self.tutor_graph:
            return {"error": "AI Service not initialized"}

        try:
            from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

            lc_messages = []
            for m in messages:
                if m["role"] == "user":
                    lc_messages.append(HumanMessage(content=m["content"]))
                elif m["role"] == "assistant":
                    lc_messages.append(AIMessage(content=m["content"]))
                elif m["role"] == "system":
                    lc_messages.append(SystemMessage(content=m["content"]))

            input_state = {
                "messages": lc_messages,
                "context_text": context_text or "",
                "target_language": target_language,
            }

            result = self.tutor_graph.invoke(input_state)
            last_message = result["messages"][-1]

            return {"content": last_message.content, "role": "assistant"}
        except Exception as e:
            print(f"Error in chat_with_tutor: {e}")
            return {"error": str(e)}

    def translate_batch(
        self,
        texts: List[str],
        target_language: str = "Chinese",
    ) -> Dict[int, str]:
        """
        Translate multiple texts in a single batch API call.

        Args:
            texts: List of texts to translate
            target_language: Target language for translation

        Returns:
            Dict mapping index -> translation
        """
        if not texts:
            return {}

        from ai.providers import get_llm_provider

        # Prepare batch text with numbered format
        batch_text = "\n---\n".join([f"[{i}] {t}" for i, t in enumerate(texts)])

        system_prompt = (
            f"You are a translator. Translate each numbered subtitle segment to {target_language}. "
            "Keep the [number] prefix in your response. Only output translations, no explanations."
        )

        try:
            llm = get_llm_provider().get_chat_model(temperature=0.3)
            response = llm.invoke([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": batch_text},
            ])

            # Parse response
            result_text = response.content
            translations: Dict[int, str] = {}

            for line in result_text.split("\n"):
                line = line.strip()
                if line.startswith("["):
                    try:
                        idx_end = line.index("]")
                        idx = int(line[1:idx_end])
                        translation = line[idx_end + 1 :].strip()
                        if translation:
                            translations[idx] = translation
                    except (ValueError, IndexError):
                        continue

            return translations

        except Exception as e:
            print(f"Error in translate_batch: {e}")
            return {}


# Global singleton instance
ai_service = AIService()
