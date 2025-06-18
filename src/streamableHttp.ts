#!/usr/bin/env node

import express, { Request, Response } from 'express';
/* eslint-disable n/no-missing-import */
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage, JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
/* eslint-enable n/no-missing-import */
import { createServer } from './server.js';

const app = express();
app.use( express.json() );

// HTTP Transport that implements the MCP Transport interface
class HTTPTransport implements Transport {
	private messageHandler?: ( message: JSONRPCMessage ) => void;

	private errorHandler?: ( error: Error ) => void;

	private closeHandler?: () => void;

	private responseMessage?: JSONRPCMessage;

	public start(): Promise<void> {
		return Promise.resolve();
	}

	public async send( message: JSONRPCMessage ): Promise<void> {
		// Store the response message to be returned to the HTTP client
		this.responseMessage = message;
	}

	public close(): Promise<void> {
		if ( this.closeHandler ) {
			this.closeHandler();
		}
		return Promise.resolve();
	}

	public onMessage( handler: ( message: JSONRPCMessage ) => void ): void {
		this.messageHandler = handler;
	}

	public onError( handler: ( error: Error ) => void ): void {
		this.errorHandler = handler;
	}

	public onClose( handler: () => void ): void {
		this.closeHandler = handler;
	}

	public async processRequest( request: JSONRPCRequest ): Promise<JSONRPCMessage | null> {
		// Send the request to the server
		if ( this.messageHandler ) {
			this.messageHandler( request );
			// Wait a bit for the response to be set
			await new Promise<void>( ( resolve ) => {
				setTimeout( () => resolve(), 10 );
			} );
			return this.responseMessage || null;
		}
		return null;
	}
}

const mcpHandler = async ( req: Request, res: Response ): Promise<void> => {
	try {
		const message: JSONRPCMessage = req.body;

		// Validate JSON-RPC format
		if ( !message.jsonrpc || message.jsonrpc !== '2.0' ) {
			res.status( 400 ).json( {
				jsonrpc: '2.0',
				error: {
					code: -32600,
					message: 'Invalid Request - missing or invalid jsonrpc field'
				},
				id: 'id' in message ? message.id : null
			} );
			return;
		}

		// Validate that this is a request (has method field)
		if ( !( 'method' in message ) || !message.method ) {
			res.status( 400 ).json( {
				jsonrpc: '2.0',
				error: {
					code: -32600,
					message: 'Invalid Request - missing method field'
				},
				id: 'id' in message ? message.id : null
			} );
			return;
		}

		const request = message as JSONRPCRequest;

		// Create server and transport for this request
		const server = createServer();
		const transport = new HTTPTransport();

		// Connect server to transport
		await server.connect( transport );

		// Process the request
		const response = await transport.processRequest( request );

		if ( response ) {
			res.json( response );
		} else if ( request.id === undefined || request.id === null ) {
			// This was a notification - no response expected
			res.status( 204 ).end();
		} else {
			// Something went wrong - no response for a request
			res.status( 500 ).json( {
				jsonrpc: '2.0',
				error: {
					code: -32603,
					message: 'Internal error - no response generated'
				},
				id: request.id
			} );
		}

		// Clean up
		await transport.close();
		server.close();

	} catch ( error ) {
		console.error( 'Error handling MCP request:', error );
		res.status( 500 ).json( {
			jsonrpc: '2.0',
			error: {
				code: -32603,
				message: 'Internal server error'
			},
			id: null
		} );
	}
};

app.post( '/mcp', mcpHandler );

app.get( '/mcp', async ( req: Request, res: Response ) => {
	console.log( 'Received GET MCP request' );
	res.writeHead( 405 ).end( JSON.stringify( {
		jsonrpc: '2.0',
		error: {
			code: -32000,
			message: 'Method not allowed.'
		},
		id: null
	} ) );
} );

app.delete( '/mcp', async ( req: Request, res: Response ) => {
	console.log( 'Received DELETE MCP request' );
	res.writeHead( 405 ).end( JSON.stringify( {
		jsonrpc: '2.0',
		error: {
			code: -32000,
			message: 'Method not allowed.'
		},
		id: null
	} ) );
} );

// Start the server
const PORT = process.env.PORT || 3000;
app.listen( PORT, () => {
	console.log( `MCP HTTP Server listening on port ${ PORT }` );
} );
