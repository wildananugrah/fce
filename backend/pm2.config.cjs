module.exports = {
	apps: [
		{
			name: "fce-backend",
			script: "src/index.ts",
			interpreter: "bun",
			exec_mode: "fork",
			env: {
				NODE_ENV: "development",
			},
		},
	],
};
