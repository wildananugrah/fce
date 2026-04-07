module.exports = {
	apps: [
		{
			name: "fce-backend",
			script: "src/index.ts",
			interpreter: "bun",
			env: {
				NODE_ENV: "production",
			},
			instances: 1,
			autorestart: true,
			watch: false,
			max_memory_restart: "512M",
		},
	],
};
