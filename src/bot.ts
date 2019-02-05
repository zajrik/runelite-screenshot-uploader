import { Logger } from '@yamdbf/core';
import { Client } from './client/Client';

let client: Client = new Client();
client.start();

process.on('unhandledRejection', (reason: any) => {
	if (/ETIMEDOUT|getaddrinfo|Something took too long to do/.test(reason)) process.exit(200);
	else Logger.instance().error('UnhandledRejection', reason.stack ? reason.stack : reason);
});
