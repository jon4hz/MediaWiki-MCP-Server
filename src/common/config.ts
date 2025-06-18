interface AppConfig {
	WIKI_SERVER: string;
	ARTICLE_PATH: string;
	SCRIPT_PATH: string;
	BASIC_AUTH_USERNAME?: string;
	BASIC_AUTH_PASSWORD?: string;
	WIKI_USERNAME?: string;
	WIKI_PASSWORD?: string;
}

// TODO: Need better handling for credentials since they will be different for each wiki.
const defaultConfig: AppConfig = {
	WIKI_SERVER: process.env.WIKI_SERVER || 'https://en.wikipedia.org',
	ARTICLE_PATH: process.env.ARTICLE_PATH || '/wiki',
	SCRIPT_PATH: process.env.SCRIPT_PATH || '/w',
	BASIC_AUTH_USERNAME: process.env.BASIC_AUTH_USERNAME || undefined,
	BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD || undefined,
	WIKI_USERNAME: process.env.WIKI_USERNAME || undefined,
	WIKI_PASSWORD: process.env.WIKI_PASSWORD || undefined
};

let currentConfig: AppConfig = { ...defaultConfig };

export function getConfig(): Readonly<AppConfig> {
	return { ...currentConfig }; // Return a copy to prevent direct external mutation
}

export function updateConfig( newConfig: Partial<AppConfig> ): void {
	const effectiveNewConfig = { ...newConfig };

	// If WIKI_SERVER is being updated, and ARTICLE_PATH/SCRIPT_PATH are not explicitly provided,
	// reset them to their global defaults from defaultConfig.
	if ( newConfig.WIKI_SERVER && newConfig.WIKI_SERVER !== currentConfig.WIKI_SERVER ) {
		if ( newConfig.ARTICLE_PATH === undefined ) {
			effectiveNewConfig.ARTICLE_PATH = defaultConfig.ARTICLE_PATH;
		}
		if ( newConfig.SCRIPT_PATH === undefined ) {
			effectiveNewConfig.SCRIPT_PATH = defaultConfig.SCRIPT_PATH;
		}
	}
	currentConfig = { ...currentConfig, ...effectiveNewConfig };
}

export function resetConfig(): void {
	currentConfig = { ...defaultConfig };
}

export const WIKI_SERVER = (): string => getConfig().WIKI_SERVER;
export const ARTICLE_PATH = (): string => getConfig().ARTICLE_PATH;
export const SCRIPT_PATH = (): string => getConfig().SCRIPT_PATH;

export const BASIC_AUTH_USERNAME = (): string|undefined => {
	const username = getConfig().BASIC_AUTH_USERNAME;
	return isInputValid( username ) ? username : undefined;
};
export const BASIC_AUTH_PASSWORD = (): string|undefined => {
	const password = getConfig().BASIC_AUTH_PASSWORD;
	return isInputValid( password ) ? password : undefined;
};
export const WIKI_USERNAME = (): string|undefined => {
	const username = getConfig().WIKI_USERNAME;
	return isInputValid( username ) ? username : undefined;
};
export const WIKI_PASSWORD = (): string|undefined => {
	const password = getConfig().WIKI_PASSWORD;
	return isInputValid( password ) ? password : undefined;
};

function isInputValid( input: string | undefined ): boolean {
	return input !== undefined && input !== null && input !== '';
}
