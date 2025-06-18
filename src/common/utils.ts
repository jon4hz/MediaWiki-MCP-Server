import fetch, { Response } from 'node-fetch';
import { USER_AGENT } from '../server.js';
import { SCRIPT_PATH, WIKI_SERVER, ARTICLE_PATH, BASIC_AUTH_USERNAME, BASIC_AUTH_PASSWORD, WIKI_USERNAME, WIKI_PASSWORD } from './config.js';

// Global variable to store the login token
let cachedLoginToken: string | null = null;

// Global variable to track login session state
let isLoggedIn: boolean = false;

// Interface for MediaWiki API login token response
interface MediaWikiLoginTokenResponse {
	query?: {
		tokens?: {
			logintoken?: string;
		};
	};
}

// Interface for MediaWiki API login response
interface MediaWikiLoginResponse {
	login?: {
		result: string;
		reason?: string;
		lguserid?: number;
		lgusername?: string;
	};
}

// Function to fetch login token from MediaWiki
async function fetchLoginToken(): Promise<string | null> {
	const wikiUsername = WIKI_USERNAME();
	const wikiPassword = WIKI_PASSWORD();

	if ( !wikiUsername || !wikiPassword ) {
		throw new Error( 'Wiki credentials not configured' );
	}

	try {
		const response = await fetchCore(
			`${ WIKI_SERVER() }${ SCRIPT_PATH() }/api.php`,
			{
				params: {
					action: 'query',
					meta: 'tokens',
					format: 'json',
					type: 'login'
				}
			}
		);

		const data = await response.json() as MediaWikiLoginTokenResponse;
		return data.query?.tokens?.logintoken || null;
	} catch ( error ) {
		console.error( 'Failed to fetch login token:', error );
		return null;
	}
}

// Function to get login token (cached or fetch new one)
async function getLoginToken(): Promise<string | null> {
	if ( !cachedLoginToken ) {
		cachedLoginToken = await fetchLoginToken();
	}
	return cachedLoginToken;
}

// Function to clear cached token (in case of authentication failure)
export function clearLoginToken(): void {
	cachedLoginToken = null;
	isLoggedIn = false;
}

// Function to perform login request to establish session
async function loginRequest(): Promise<void> {
	// If already logged in, nothing further needs to be done
	if ( isLoggedIn ) {
		return;
	}

	const wikiUsername = WIKI_USERNAME();
	const wikiPassword = WIKI_PASSWORD();
	const loginToken = await getLoginToken();

	if ( !wikiUsername || !wikiPassword || !loginToken ) {
		throw new Error( 'Wiki credentials or login token not available' );
	}

	try {
		const response = await fetchCore(
			`${ WIKI_SERVER() }${ SCRIPT_PATH() }/api.php`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: {
					action: 'login',
					lgname: wikiUsername,
					lgpassword: wikiPassword,
					lgtoken: loginToken,
					format: 'json'
				}
			}
		);

		const data = await response.json() as MediaWikiLoginResponse;

		// Check for login errors
		if ( data.login?.result !== 'Success' ) {
			const reason = data.login?.reason || 'Unknown error';
			throw new Error( `Login failed: ${ reason }` );
		}

		// Set login to be done
		isLoggedIn = true;
	} catch ( error ) {
		// Clear cached token on login failure
		cachedLoginToken = null;
		isLoggedIn = false;
		throw new Error( `Login request failed: ${ ( error as Error ).message }` );
	}
}

async function fetchCore(
	baseUrl: string,
	options?: {
		params?: Record<string, string>;
		headers?: Record<string, string>;
		body?: Record<string, unknown>;
		method?: string;
	}
): Promise<Response> {
	let url = baseUrl;

	if ( url.startsWith( '//' ) ) {
		url = 'https:' + url;
	}

	if ( options?.params ) {
		const queryString = new URLSearchParams( options.params ).toString();
		if ( queryString ) {
			url = `${ url }?${ queryString }`;
		}
	}

	const requestHeaders: Record<string, string> = {
		'User-Agent': USER_AGENT
	};

	// Add basic authentication if credentials are available
	const basicUsername = BASIC_AUTH_USERNAME();
	const basicPassword = BASIC_AUTH_PASSWORD();
	if ( basicUsername && basicPassword ) {
		const credentials = Buffer.from( `${ basicUsername }:${ basicPassword }` ).toString( 'base64' );
		requestHeaders.Authorization = `Basic ${ credentials }`;
	}

	if ( options?.headers ) {
		Object.assign( requestHeaders, options.headers );
	}

	const fetchOptions: { headers: Record<string, string>; method?: string; body?: string } = {
		headers: requestHeaders,
		method: options?.method || 'GET'
	};
	if ( options?.body ) {
		// Handle form data for login requests
		if ( requestHeaders[ 'Content-Type' ] === 'application/x-www-form-urlencoded' ) {
			const formData = new URLSearchParams();
			for ( const [ key, value ] of Object.entries( options.body ) ) {
				formData.append( key, String( value ) );
			}
			fetchOptions.body = formData.toString();
		} else {
			fetchOptions.body = JSON.stringify( options.body );
		}
	}
	const response = await fetch( url, fetchOptions );
	if ( !response.ok ) {
		const errorBody = await response.text().catch( () => 'Could not read error response body' );
		throw new Error(
			`HTTP error! status: ${ response.status } for URL: ${ response.url }. Response: ${ errorBody }`
		);
	}
	return response;
}

export async function makeApiRequest<T>(
	url: string,
	params?: Record<string, string>,
	needAuth: boolean = false
): Promise<T | null> {
	let requestParams = params || {};

	// Add MediaWiki authentication parameters if needed
	if ( needAuth ) {
		// Ensure we're logged in before making authenticated requests
		await loginRequest();

		const wikiUsername = WIKI_USERNAME();
		const wikiPassword = WIKI_PASSWORD();
		const loginToken = await getLoginToken();

		if ( wikiUsername && wikiPassword && loginToken ) {
			requestParams = {
				...requestParams,
				lgname: wikiUsername,
				lgpassword: wikiPassword,
				lgtoken: loginToken
			};
		} else {
			throw new Error( 'Wiki authentication credentials or token not available' );
		}
	}

	const response = await fetchCore( url, {
		params: requestParams,
		headers: { Accept: 'application/json' }
	} );
	return ( await response.json() ) as T;
}

export async function makeRestGetRequest<T>(
	path: string,
	params?: Record<string, string>,
	needAuth: boolean = false
): Promise<T | null> {
	const headers: Record<string, string> = {
		Accept: 'application/json'
	};

	// Add MediaWiki authentication parameters if needed
	let requestParams = params || {};
	if ( needAuth ) {
		// Ensure we're logged in before making authenticated requests
		await loginRequest();

		const wikiUsername = WIKI_USERNAME();
		const wikiPassword = WIKI_PASSWORD();
		const loginToken = await getLoginToken();

		if ( wikiUsername && wikiPassword && loginToken ) {
			requestParams = {
				...requestParams,
				lgname: wikiUsername,
				lgpassword: wikiPassword,
				lgtoken: loginToken
			};
		} else {
			throw new Error( 'Wiki authentication credentials or token not available' );
		}
	}

	const response = await fetchCore( `${ WIKI_SERVER() }${ SCRIPT_PATH() }/rest.php${ path }`, {
		params: requestParams,
		headers: headers
	} );
	return ( await response.json() ) as T;
}

export async function makeRestPutRequest<T>(
	path: string,
	body: Record<string, unknown>,
	needAuth: boolean = false
): Promise<T | null> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Content-Type': 'application/json'
	};

	let requestBody = { ...body };

	// Add MediaWiki authentication parameters if needed
	if ( needAuth ) {
		// Ensure we're logged in before making authenticated requests
		await loginRequest();

		const wikiUsername = WIKI_USERNAME();
		const wikiPassword = WIKI_PASSWORD();
		const loginToken = await getLoginToken();

		if ( wikiUsername && wikiPassword && loginToken ) {
			requestBody = {
				...requestBody,
				lgname: wikiUsername,
				lgpassword: wikiPassword,
				lgtoken: loginToken
			};
		} else {
			throw new Error( 'Wiki authentication credentials or token not available' );
		}
	}

	const response = await fetchCore( `${ WIKI_SERVER() }${ SCRIPT_PATH() }/rest.php${ path }`, {
		headers: headers,
		method: 'PUT',
		body: requestBody
	} );
	return ( await response.json() ) as T;
}

export async function makeRestPostRequest<T>(
	path: string,
	body?: Record<string, unknown>,
	needAuth: boolean = false
): Promise<T | null> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		'Content-Type': 'application/json'
	};

	let requestBody = body ? { ...body } : {};

	// Add MediaWiki authentication parameters if needed
	if ( needAuth ) {
		// Ensure we're logged in before making authenticated requests
		await loginRequest();

		const wikiUsername = WIKI_USERNAME();
		const wikiPassword = WIKI_PASSWORD();
		const loginToken = await getLoginToken();

		if ( wikiUsername && wikiPassword && loginToken ) {
			requestBody = {
				...requestBody,
				lgname: wikiUsername,
				lgpassword: wikiPassword,
				lgtoken: loginToken
			};
		} else {
			throw new Error( 'Wiki authentication credentials or token not available' );
		}
	}

	const response = await fetchCore( `${ WIKI_SERVER() }${ SCRIPT_PATH() }/rest.php${ path }`, {
		headers: headers,
		method: 'POST',
		body: requestBody
	} );
	return ( await response.json() ) as T;
}

export async function fetchPageHtml( url: string ): Promise<string | null> {
	try {
		const response = await fetchCore( url );
		return await response.text();
	} catch ( error ) {
		// console.error(`Error fetching HTML page from ${url}:`, error);
		return null;
	}
}

export async function fetchImageAsBase64( url: string ): Promise<string | null> {
	try {
		const response = await fetchCore( url );
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from( arrayBuffer );
		return buffer.toString( 'base64' );
	} catch ( error ) {
		// console.error(`Error fetching image from ${url}:`, error);
		return null;
	}
}

export function getPageUrl( title: string ): string {
	return `${ WIKI_SERVER() }${ ARTICLE_PATH() }/${ encodeURIComponent( title ) }`;
}
