export interface Env {
	BLOG_STORE: KVNamespace;
	MASTO_BASE_URL: string;
	MASTO_KEY: string;
}

export default {
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		// check for rss updates from blog.ollieg.codes/rss/feed.text.xml
		const res = await fetch("https://blog.ollieg.codes/rss/feed.text.xml");
		const xml = await res.text();


		// TODO: use a proper xml parser, this may only work with basic rss feeds that arent malformed
		// get the newest item title from the rss feed
		const titles = xml.match(/<title>(.*?)<\/title>/);

		// no titles
		if (titles === null) {
			return;
		}

		// get the newest title
		const newest_item_title = titles[1];

		// no item titles
		if (newest_item_title === null) {
			return;
		}


		// get the latest title from the KV store
		const kv_newest_title = await env.BLOG_STORE.get("newest_title");

		// if there's no newest title, this is the first run (don't do anything)
		if (kv_newest_title === null) {
			return;
		}


		// if the newest title from the rss feed is the same as the newest title from the KV store, there's no new posts
		if (newest_item_title === kv_newest_title) {
			return;
		}


		// for each post past the newest title in the KV store, post it to mastodon
		const posts = xml.match(/<item>(.*?)<\/item>/g);
		if (posts === null) {
			return;
		}

		const newest_title_index = posts.findIndex((post) => post.includes(kv_newest_title));
		if (newest_title_index === -1) {
			// remove from KV store (erroneous title)
			await env.BLOG_STORE.delete("newest_title");
			return;
		}

		const new_posts = posts.slice(0, newest_title_index);
		for (const post of new_posts) {
			const titles = post.match(/<title>(.*?)<\/title>/);

			let title = null;
			if (titles !== null) {
				title = titles[1];
			}
			
			const links = post.match(/<link>(.*?)<\/link>/);
			let link = null;
			if (links !== null) {
				link = links[1];
			}

			let content = "New blog post";
			if (title) {
				content += `: ${title}`;
			}
			if (link) {
				content += `\n${link}`;
			}
			content += "\nThis was posted automatically by https://github.com/obfuscatedgenerated/cf-rss-update-worker";
		}

		// update the newest title in the KV store
		await env.BLOG_STORE.put("newest_title", newest_item_title);
	},
};