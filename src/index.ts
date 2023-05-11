const DOMParser = require("dom-parser");

export interface Env {
	BLOG_STORE: KVNamespace;
	MASTO_BASE_URL: string;
	MASTO_KEY: string;
}

// TODO: there are a lot of ways to trick this, this is just a demo
// TODO: use better method of checking post than title

export default {
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		// check for rss updates from blog.ollieg.codes/rss/feed.text.xml
		// TODO: make this configurable
		// TODO: check if request failed
		const res = await fetch("https://blog.ollieg.codes/rss/feed.text.xml");

		if (res.status !== 200) {
			console.warn("Failed to get rss feed");
			return;
		}

		const xml = await res.text();

		if (xml === null) {
			console.warn("Failed to get rss feed (2)");
			return;
		}


		// parse the text
		const parser = new DOMParser();

		let doc: any;

		try {
			doc = parser.parseFromString(xml, "text/xml");
		} catch (e) {
			console.warn("Failed to parse rss feed");
			return;
		}

		// get the newest item from the rss feed
		const posts = doc.getElementsByTagName("item");
		const latest_item = posts[0];

		// no items
		if (latest_item === null) {
			console.warn("No items in rss feed");
			return;
		}

		// get newest item's title
		const newest_item_title_el = latest_item.getElementsByTagName("title")[0];

		// no title
		if (newest_item_title_el === null) {
			console.warn("No title in item");
			return;
		}

		// no item titles
		if (newest_item_title_el === null) {
			return;
		}

		const newest_item_title = newest_item_title_el.textContent;

		// get the latest title from the KV store
		const kv_newest_title = await env.BLOG_STORE.get("newest_title");

		// if there's no newest title, this is the first run (store title then don't do anything)
		if (kv_newest_title === null) {
			await env.BLOG_STORE.put("newest_title", newest_item_title);
			console.log("First run, storing newest title");
			return;
		}


		// if the newest title from the rss feed is the same as the newest title from the KV store, there's no new posts
		if (newest_item_title === kv_newest_title) {
			console.log("No new posts");
			return;
		}


		// for each post past the newest title in the KV store, post it to mastodon
		if (posts === null) {
			console.warn("No posts in rss feed (2)");
			return;
		}

		// get all title elements in posts
		const posts_array = Array.from(posts).map((post) => {
			const title_el = post.getElementsByTagName("title")[0];
			if (title_el === null) {
				return null;
			}
			return title_el.textContent;
		});

		const newest_title_index = posts_array.findIndex((post) => post.includes(kv_newest_title));
		if (newest_title_index === -1) {
			// remove from KV store (erroneous title)
			await env.BLOG_STORE.delete("newest_title");
			console.warn("Erroneous title in KV store");
			return;
		}

		const new_posts = posts.slice(0, newest_title_index);
		for (const post of new_posts) {
			// get the title and link from the post
			const title_el = post.getElementsByTagName("title")[0];

			let title = null;
			if (title_el !== null) {
				title = title_el.textContent;
			}

			const link_el = post.getElementsByTagName("link")[0];
			let link = null;
			if (link_el !== null) {
				link = link_el[1];
			}

			let content = "New blog post";
			if (title) {
				content += `: ${title}`;
			}
			if (link) {
				content += `\n${link}`;
			}
			content += "\nThis was posted automatically by https://github.com/obfuscatedgenerated/cf-rss-update-worker";

			// post to mastodon
			const res = await fetch(`${env.MASTO_BASE_URL}/api/v1/statuses`, {
				method: "POST",
				headers: {
					"Authorization": `Bearer ${env.MASTO_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					status: content,
				}),
			});

			if (res.status !== 200) {
				console.warn("Failed to post to mastodon");
				return;
			}
		}
		// update the newest title in the KV store
		await env.BLOG_STORE.put("newest_title", newest_item_title);
		console.log("Finished");
	},
};