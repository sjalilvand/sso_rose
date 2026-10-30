module.exports = {
  apps: [{
    name: "rose-hub",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 8082",
    cwd: __dirname,
    env: {
      NODE_ENV: "production",
      PORT: "8082"
    },
    autorestart: true,
    max_memory_restart: "700M",
    time: true
  }]
};
