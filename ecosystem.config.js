module.exports = {
  apps: [
    {
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
    },
    {
      name: "rose-bale-bot",
      script: "scripts/bale-bot.cjs",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        BALE_BOT_TOKEN: "1784419208:0dx2l-avlkOLIAb9VyUlOi6qsyI07DE3OFw",
        APP_PUBLIC_URL: "http://130.185.73.157:8082"
      },
      autorestart: true,
      max_memory_restart: "300M",
      time: true
    }
  ]
};
