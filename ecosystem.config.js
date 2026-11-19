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
      // pacing so a fast startup crash does not hammer the CPU and PM2 keeps
      // a readable error log instead of racing into "errored" state
      min_uptime: "15s",
      max_restarts: 20,
      restart_delay: 4000,
      // Next 16 production server can legitimately touch ~800M RSS
      max_memory_restart: "900M",
      kill_timeout: 8000,
      time: true,
      // persist logs to files so startup crashes are always diagnosable
      merge_logs: true,
      out_file: "logs/rose-hub-out.log",
      error_file: "logs/rose-hub-error.log"
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
      min_uptime: "15s",
      max_restarts: 20,
      restart_delay: 4000,
      max_memory_restart: "300M",
      time: true,
      merge_logs: true,
      out_file: "logs/bale-bot-out.log",
      error_file: "logs/bale-bot-error.log"
    }
  ]
};
