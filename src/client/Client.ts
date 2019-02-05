import { Client as YamdbfClient, Util, ListenerUtil, Guild, LogLevel, Logger, logger, YAMDBFOptions } from '@yamdbf/core';
import { TextChannel, MessageAttachment, GuildCreateChannelOptions } from 'discord.js';
import { readdirSync, statSync, Stats } from 'fs';
import * as path from 'path';

const RUN_ONCE: boolean = process.env['RUN_ONCE'] === 'true';
const config: any = require('../config.json');
const { once } = ListenerUtil;

let clientOpts: YAMDBFOptions = {
	token: config.token,
	readyText: 'RuneLite Screenshot Uploader ready!',
	logLevel: RUN_ONCE ? LogLevel.LOG : LogLevel.ERROR,
	disableBase: Util.baseCommandNames
		.filter(c => c !== 'eval' && c !== 'ping')
};

export class Client extends YamdbfClient
{
	@logger('Client')
	private readonly logger!: Logger;

	private screenshotDir: string = path.join(
		process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'] as string,
		'.runelite',
		'screenshots',
		config.username
	);

	private skills: string[] = [
		'Attack', 'Hitpoints', 'Mining',
		'Strength', 'Agility', 'Smithing',
		'Defence', 'Herblore', 'Fishing',
		'Ranged', 'Thieving', 'Cooking',
		'Prayer', 'Crafting', 'Firemaking',
		'Magic', 'Fletching', 'Woodcutting',
		'Runecraft', 'Slayer', 'Farming',
		'Construction', 'Hunter'
	];

	public constructor()
	{
		super(clientOpts);
	}

	@once('clientReady')
	// @ts-ignore -- Handled via ListenerUtil
	private async onceReady(): Promise<void>
	{
		if (RUN_ONCE) this.logger.setLogLevel(LogLevel.ERROR);
		if (!await this.storage.exists('postedScreenshots'))
			await this.storage.set('postedScreenshots', []);

		await this.createMissingChannels();

		if (RUN_ONCE)
		{
			const numUploaded: number = await this.uploadNewScreenshots();
			if (numUploaded > 0) this.logger.log(`Uploaded ${numUploaded} screenshots`);
			else this.logger.log('No screenshots to upload');

			this.logger.log('Closing in 10 seconds...');
			await new Promise(r => setTimeout(r, 10e3));
			process.exit();
		}

		await this.uploadNewScreenshots();

		this.setInterval(() => this.uploadNewScreenshots(), 60e3);
	}

	/**
	 * Create the channels for screenshots if they are missing
	 */
	private async createMissingChannels(): Promise<void>
	{
		const guild: Guild = this.guilds.first()!;
		const opts: GuildCreateChannelOptions = { type: 'text' };

		if (!this.findChannelByName('level-ups'))
			await guild.channels.create('level-ups', opts);

		if (!this.findChannelByName('quests'))
			await guild.channels.create('quests', opts);

		if (!this.findChannelByName('barrows'))
			await guild.channels.create('barrows', opts);

		if (!this.findChannelByName('pets'))
			await guild.channels.create('pets', opts);

		if (!this.findChannelByName('misc'))
			await guild.channels.create('misc', opts);
	}

	/**
	 * Get a guild channel by the given name
	 */
	private findChannelByName(name: string): TextChannel
	{
		return this.guilds.first()!.channels.find(c => c.name === name) as TextChannel;
	}

	/**
	 * Get the appropriate channel for the given screenshot
	 */
	private getAppropriateChannel(screenshot: string): TextChannel
	{
		const labelRegex: RegExp = /([A-Z][a-z]+)\(.+\)\.png/;
		const petRegex: RegExp = /Pet [\d_\-]+.png/;
		const label: string = labelRegex.test(screenshot) ? screenshot.match(labelRegex)![1] : null!;

		if (this.skills.includes(label)) return this.findChannelByName('level-ups');
		if (petRegex.test(screenshot)) return this.findChannelByName('pets');
		if (label === 'Barrows') return this.findChannelByName('barrows');
		if (label === 'Quest') return this.findChannelByName('quests');
		return this.findChannelByName('misc');
	}

	/**
	 * Return whether or not the given screenshot has been posted before
	 */
	private async hasBeenPostedBefore(screenshot: string): Promise<boolean>
	{
		const postedScreenshots: string[] = await this.storage.get('postedScreenshots');
		return postedScreenshots.includes(screenshot);
	}

	/**
	 * Upload the given screenshot to the appropriate channel if it has not been posted before.
	 * Returns whether or not the upload was completed
	 */
	private async upload(screenshot: string): Promise<boolean>
	{
		if (await this.hasBeenPostedBefore(screenshot)) return false;

		const labelRegex: RegExp = /([A-Z][a-z]+)\((.+)\)\.png/;
		const petRegex: RegExp = /Pet [\d_\-]+.png/;
		const label: string = labelRegex.test(screenshot) ? screenshot.match(labelRegex)![1] : null!;
		const subText: string = labelRegex.test(screenshot) ? screenshot.match(labelRegex)![2] : null!;

		const channel: TextChannel = this.getAppropriateChannel(screenshot);
		const attachment: MessageAttachment = new MessageAttachment(screenshot);

		let content: any[] = [attachment];

		if (label)
		{
			let text: string;
			if (label === 'Quest') text = `Completed quest "${subText}"`;
			if (label === 'Barrows') text = `Opened Barrows chest #${subText}`;
			if (this.skills.includes(label)) text = `Gained a level in ${label} (${subText})`;
			content.unshift(text!);
		}

		let logMessage: string = 'Uploading ';

		if (content.length === 2) logMessage += `\`${content[0]}\` screenshot`;
		else if (petRegex.test(screenshot)) logMessage += 'Pet drop screenshot';
		else logMessage += 'misc screenshot';
		logMessage += '...';

		this.logger.log(logMessage);

		try
		{
			await channel.send(...content);
		}
		catch
		{
			this.logger.error('Failed to upload screenshot');
			return false;
		}

		this.logger.log('Successfully uploaded screenshot');

		let postedScreenshots: string[] = await this.storage.get('postedScreenshots');
		postedScreenshots.push(screenshot);
		await this.storage.set('postedScreenshots', postedScreenshots);
		return true;
	}

	/**
	 * Return an array of new screenshots that have not been uploaded yet
	 */
	private async getNewScreenshots(): Promise<string[]>
	{
		let newScreenshots: string[] = [];
		let fileData: { [file: string]: Stats } = {};
		let allScreenshots = readdirSync(this.screenshotDir)
			.map(s => path.join(this.screenshotDir, s));

		for (const screenshot of allScreenshots)
			fileData[screenshot] = statSync(screenshot);

		allScreenshots.sort((a, b) => fileData[a].birthtimeMs - fileData[b].birthtimeMs);

		for (const screenshot of allScreenshots)
			if (!await this.hasBeenPostedBefore(screenshot))
				newScreenshots.push(screenshot);

		return newScreenshots;
	}

	/**
	 * Upload any new screenshots, returning the number of succesfully uploaded screenshots
	 */
	private async uploadNewScreenshots(): Promise<number>
	{
		let numUploaded: number = 0;

		this.logger.log('Checking for new screenshots...');
		const newScreenshots: string[] = await this.getNewScreenshots();

		for (const screenshot of newScreenshots)
		{
			const success: boolean = await this.upload(screenshot);
			if (success) numUploaded++;
			else break;
		}

		return numUploaded;
	}
}
