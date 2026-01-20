"""
AI Service Module
Provides high-level AI functionality using abstracted providers.
"""

import re
from typing import List, Dict, Any, Optional, Callable

# Provider imports
from ai.providers import get_whisper_provider, WhisperProvider
from ai.config import get_config
from chunked_transcription import transcribe_audio_chunked, TranscriptionProgress

# LangChain imports
try:
    from ai.chains import (
        get_dictionary_chain,
        get_context_chain,
        get_augmented_dictionary_chain,
        get_dictionary_chain_with_llm,
        get_context_chain_with_llm,
        get_augmented_dictionary_chain_with_llm,
    )
    from ai.graph import create_tutor_graph
    from ai.providers.llm import LLMProvider
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

    def transcribe_audio(
        self,
        audio_path: str,
        progress_callback: Optional[Callable[[TranscriptionProgress], None]] = None
    ) -> List[Dict[str, Any]]:
        """
        Transcribes the given audio file using the configured Whisper provider.
        Automatically handles long audio by chunking.
        Returns a list of segment dictionaries compatible with SubtitleSegment.

        Args:
            audio_path: Path to the audio file
            progress_callback: Optional callback for progress updates

        Returns:
            List of segment dictionaries
        """
        if not self._whisper_provider:
            raise ValueError("Whisper provider not initialized. Check your .env configuration.")

        print(f"Transcribing: {audio_path}")

        # Use chunked transcription for automatic handling of long audio
        segments = transcribe_audio_chunked(
            audio_path,
            self._whisper_provider,
            progress_callback
        )

        print(f"Transcription complete: {len(segments)} segments")
        return segments

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

    # =========================================================================
    # Provider-Injected Methods (for user-configured LLM)
    # =========================================================================

    def lookup_word_with_provider(
        self,
        word: str,
        context_sentence: str,
        target_language: str,
        sentence_translation: Optional[str],
        llm_provider: "LLMProvider",
    ) -> Dict[str, Any]:
        """
        Analyzes a word in context using an externally provided LLM provider.
        """
        llm = llm_provider.get_chat_model(temperature=0.3)

        if sentence_translation:
            try:
                chain = get_augmented_dictionary_chain_with_llm(llm)
                result = chain.invoke({
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

        try:
            chain = get_dictionary_chain_with_llm(llm)
            result = chain.invoke({
                "word": word,
                "context_sentence": context_sentence,
                "target_language": target_language,
            })
            return result.model_dump()
        except Exception as e:
            print(f"Error in lookup_word_with_provider: {e}")
            return {"error": str(e)}

    def explain_context_with_provider(
        self,
        subtitle_text: str,
        target_language: str,
        llm_provider: "LLMProvider",
    ) -> Dict[str, Any]:
        """
        Explains grammar/culture using an externally provided LLM provider.
        """
        try:
            llm = llm_provider.get_chat_model(temperature=0.7)
            chain = get_context_chain_with_llm(llm)
            result = chain.invoke({
                "subtitle_text": subtitle_text,
                "target_language": target_language,
            })
            return result.model_dump()
        except Exception as e:
            print(f"Error in explain_context_with_provider: {e}")
            return {"error": str(e)}

    def chat_with_tutor_with_provider(
        self,
        messages: List[Dict[str, str]],
        context_text: Optional[str],
        target_language: str,
        llm_provider: "LLMProvider",
    ) -> Dict[str, Any]:
        """
        Runs the tutor chat using an externally provided LLM provider via LangGraph.

        Args:
            messages: Conversation history
            context_text: Optional context text for the tutor to reference
            target_language: Target language for responses
            llm_provider: User's configured LLM provider

        Returns:
            Tutor response dictionary with 'content' and 'role' keys
        """
        try:
            from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
            from ai.graph import create_tutor_graph_with_llm

            # Get chat model from provider
            llm = llm_provider.get_chat_model(temperature=0.7)

            # Create tutor graph with user's LLM
            tutor_graph = create_tutor_graph_with_llm(llm)

            # Convert message dicts to LangChain message objects
            lc_messages = []
            for m in messages:
                role = m.get("role", "user")
                content = m.get("content", "")
                if role == "user":
                    lc_messages.append(HumanMessage(content=content))
                elif role == "assistant":
                    lc_messages.append(AIMessage(content=content))
                elif role == "system":
                    lc_messages.append(SystemMessage(content=content))

            # Prepare input state for LangGraph
            input_state = {
                "messages": lc_messages,
                "context_text": context_text or "",
                "target_language": target_language,
            }

            # Invoke the graph
            result = tutor_graph.invoke(input_state)
            last_message = result["messages"][-1]

            return {"content": last_message.content, "role": "assistant"}

        except Exception as e:
            print(f"Error in chat_with_tutor_with_provider: {e}")
            import traceback
            traceback.print_exc()
            return {"error": str(e)}

    def translate_batch(
        self,
        texts: List[str],
        target_language: str = "Chinese",
        llm_provider: Optional["LLMProvider"] = None,
        batch_size: int = 20,
    ) -> Dict[int, str]:
        """
        Translate multiple texts in batched API calls to avoid token limits.

        Args:
            texts: List of texts to translate
            target_language: Target language for translation
            llm_provider: Optional LLM provider (uses global config if not provided)
            batch_size: Number of segments per API call (default 20)

        Returns:
            Dict mapping index -> translation
        """
        if not texts:
            return {}

        # Use provided provider or fall back to global config
        if llm_provider is None:
            from ai.providers import get_llm_provider
            llm_provider = get_llm_provider()

        all_translations: Dict[int, str] = {}
        total_batches = (len(texts) + batch_size - 1) // batch_size

        print(f"Translating {len(texts)} segments in {total_batches} batches (batch_size={batch_size})")

        for batch_num in range(total_batches):
            start_idx = batch_num * batch_size
            end_idx = min(start_idx + batch_size, len(texts))
            batch_texts = texts[start_idx:end_idx]

            # Prepare batch text with LOCAL indices (matching caller's segment_map)
            # Each batch still uses indices relative to the full texts list
            batch_text = "\n---\n".join([f"[{start_idx + i}] {t}" for i, t in enumerate(batch_texts)])

            system_prompt = (
                f"You are a translator. Translate each numbered subtitle segment to {target_language}. "
                "Keep the [number] prefix in your response. Output one translation per line in format: [number] translation"
            )

            try:
                llm = llm_provider.get_chat_model(temperature=0.3)
                response = llm.invoke([
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": batch_text},
                ])

                # Parse response - use regex to find all [number] patterns
                result_text = response.content

                # Pattern: [number] followed by translation text until next [number] or end
                # This handles both line-by-line and paragraph formats
                pattern = r'\[(\d+)\]\s*([^\[]+)'
                matches = re.findall(pattern, result_text, re.DOTALL)

                parsed_count = 0
                for idx_str, translation in matches:
                    try:
                        idx = int(idx_str)
                        # Clean up translation: remove trailing separators and whitespace
                        translation = translation.strip().rstrip('-').strip()
                        if translation:
                            all_translations[idx] = translation
                            parsed_count += 1
                    except (ValueError, IndexError) as e:
                        print(f"  Warning: Failed to parse index {idx_str}: {e}")
                        continue

                # Debug: if parsing failed, show raw response
                if parsed_count < len(batch_texts) // 2:
                    print(f"  Warning: Low parse rate. Response sample: {result_text[:200]}...")

                print(f"  Batch {batch_num + 1}/{total_batches}: parsed {parsed_count}/{len(batch_texts)} segments")

            except Exception as e:
                print(f"Error in translate_batch (batch {batch_num + 1}): {e}")
                # Continue with next batch instead of failing completely
                continue

        print(f"Translation complete: {len(all_translations)}/{len(texts)} segments translated")
        return all_translations


# Global singleton instance
ai_service = AIService()
