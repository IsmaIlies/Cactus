/// <reference types="vite/client" />

// Déclare explicitement les variables d'environnement exposées par Vite
interface ImportMetaEnv {
	readonly VITE_GEMINI_API_KEY: string
	readonly VITE_FIRESTORE_FORCE_LONG_POLLING?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
