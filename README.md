# BullMQ MCP Server - Model Context Protocol for BullMQ Queue Management

A comprehensive BullMQ MCP (Model Context Protocol) server for managing BullMQ Redis-based job queues. This BullMQ MCP integration enables Claude Desktop and other AI assistants to interact with BullMQ queues, monitor job status, manage workers, and perform queue operations through natural language.

**Keywords**: BullMQ MCP, BullMQ Model Context Protocol, BullMQ Claude integration, BullMQ AI assistant, BullMQ queue management, Redis queue MCP

## Features

- **🔌 Connection Management**: Connect to multiple Redis instances and switch between them
- **📊 Queue Operations**: List, pause, resume, drain, and clean queues
- **⚙️ Job Management**: Add, remove, retry, and promote jobs
- **📈 Job Monitoring**: View job details, logs, and statistics
- **🧹 Bulk Operations**: Clean jobs by status with configurable limits
- **🔄 Multiple Connections**: Manage different Redis instances (development, staging, production)
- **📝 Job Logs**: Add and view custom log entries for jobs
- **🎯 Flexible Status Filtering**: Query jobs by various states (active, waiting, completed, failed, delayed)

## Installation - BullMQ MCP Setup

### NPM Installation

```bash
npm install -g @adamhancock/bullmq-mcp
```

Or with pnpm:

```bash
pnpm install -g @adamhancock/bullmq-mcp
```

Or with yarn:

```bash
yarn global add @adamhancock/bullmq-mcp
```

### Docker Installation

Pull the Docker image from GitHub Container Registry:

```bash
docker pull ghcr.io/adamhancock/bullmq-mcp:latest
```

Or use a specific version:

```bash
docker pull ghcr.io/adamhancock/bullmq-mcp:v1.0.0
```

## Usage - Configure BullMQ MCP with Claude Desktop

### Claude Desktop Configuration

#### Quick Setup (Recommended)

If you have the Claude CLI installed, you can add the BullMQ server with a single command:

**Using npm package:**
```bash
claude mcp add --scope user bullmq -- npx -y @adamhancock/bullmq-mcp
```

**Using Docker:**
```bash
claude mcp add-json bullmq --scope user '{"command": "docker", "args": ["run", "-i", "--rm", "-e", "REDIS_URL=redis://host.docker.internal:6379", "ghcr.io/adamhancock/bullmq-mcp:latest"], "scope": "user"}'
```

**With Redis URL environment variable:**
```bash
# NPM version
claude mcp add --scope user bullmq -e REDIS_URL=redis://localhost:6379 -- npx -y @adamhancock/bullmq-mcp

# Docker version with environment variable
claude mcp add-json bullmq --scope user '{"command": "docker", "args": ["run", "-i", "--rm", "-e", "REDIS_URL=redis://host.docker.internal:6379", "ghcr.io/adamhancock/bullmq-mcp:latest"], "scope": "user"}'
```

**Note**: When using Docker with `claude mcp add`, use `host.docker.internal` instead of `localhost` to connect to Redis running on your host machine.

#### Manual Configuration

To manually configure Claude Desktop, add the following to your Claude configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bullmq": {
      "command": "npx",
      "args": ["-y", "@adamhancock/bullmq-mcp"]
    }
  }
}
```

With Redis URL:
```json
{
  "mcpServers": {
    "bullmq": {
      "command": "npx",
      "args": ["-y", "@adamhancock/bullmq-mcp"],
      "env": {
        "REDIS_URL": "redis://localhost:6379"
      }
    }
  }
}
```

**Alternative configurations:**

Using global installation:
```json
{
  "mcpServers": {
    "bullmq": {
      "command": "bullmq-mcp"
    }
  }
}
```

Using local installation:
```json
{
  "mcpServers": {
    "bullmq": {
      "command": "node",
      "args": ["/path/to/bullmq-mcp/dist/index.js"]
    }
  }
}
```

Using Docker:
```json
{
  "mcpServers": {
    "bullmq": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "ghcr.io/adamhancock/bullmq-mcp:latest"],
      "env": {
        "REDIS_URL": "redis://host.docker.internal:6379"
      }
    }
  }
}
```

Note: When using Docker, use `host.docker.internal` instead of `localhost` to connect to Redis running on your host machine.

### Available BullMQ MCP Tools

#### Connection Management

- **connect** - Connect to a Redis instance
  ```typescript
  {
    id: string,          // Connection identifier
    url?: string,        // Redis URL (e.g., redis://user:pass@localhost:6379/0)
    host?: string,       // Redis host (default: localhost) - ignored if url is provided
    port?: number,       // Redis port (default: 6379) - ignored if url is provided
    password?: string,   // Redis password (optional) - ignored if url is provided
    db?: number         // Redis database number (default: 0) - ignored if url is provided
  }
  ```
  
  The tool will use the Redis URL in this order of preference:
  1. `url` parameter if provided
  2. `REDIS_URL` environment variable if set
  3. Individual connection parameters (host, port, password, db)

- **disconnect** - Disconnect from current Redis instance

- **list_connections** - List all saved connections

- **switch_connection** - Switch to a different connection
  ```typescript
  {
    id: string  // Connection identifier to switch to
  }
  ```

#### Queue Management

- **list_queues** - List all queues in the current connection
  ```typescript
  {
    pattern?: string  // Queue name pattern (supports wildcards, default: "*")
  }
  ```

- **stats** - Get queue statistics
  ```typescript
  {
    queue: string  // Queue name
  }
  ```

- **pause_queue** - Pause queue processing
  ```typescript
  {
    queue: string  // Queue name
  }
  ```

- **resume_queue** - Resume queue processing
  ```typescript
  {
    queue: string  // Queue name
  }
  ```

- **drain_queue** - Remove all jobs from a queue
  ```typescript
  {
    queue: string  // Queue name
  }
  ```

- **clean_queue** - Clean jobs from queue
  ```typescript
  {
    queue: string,        // Queue name
    grace?: number,       // Grace period in milliseconds (default: 0)
    limit?: number,       // Maximum number of jobs to clean (default: 1000)
    status?: "completed" | "failed"  // Job status to clean (default: "completed")
  }
  ```

#### Job Management

- **get_jobs** - Get jobs from queue by status
  ```typescript
  {
    queue: string,     // Queue name
    status: "active" | "waiting" | "completed" | "failed" | "delayed" | "paused" | "repeat" | "wait",
    start?: number,    // Start index (default: 0)
    end?: number      // End index (default: 10)
  }
  ```

- **get_job** - Get a specific job by ID
  ```typescript
  {
    queue: string,  // Queue name
    jobId: string   // Job ID
  }
  ```

- **add_job** - Add a new job to the queue
  ```typescript
  {
    queue: string,      // Queue name
    name: string,       // Job name
    data: object,       // Job data (JSON object)
    opts?: {            // Job options
      delay?: number,           // Delay in milliseconds
      priority?: number,        // Job priority
      attempts?: number,        // Number of attempts
      backoff?: object,         // Backoff configuration
      removeOnComplete?: boolean,  // Remove job when completed
      removeOnFail?: boolean    // Remove job when failed
    }
  }
  ```

- **remove_job** - Remove a job from the queue
  ```typescript
  {
    queue: string,  // Queue name
    jobId: string   // Job ID
  }
  ```

- **retry_job** - Retry a failed job
  ```typescript
  {
    queue: string,  // Queue name
    jobId: string   // Job ID
  }
  ```

- **promote_job** - Promote a delayed job
  ```typescript
  {
    queue: string,  // Queue name
    jobId: string   // Job ID
  }
  ```

#### Job Logs

- **get_job_logs** - Get logs for a job
  ```typescript
  {
    queue: string,  // Queue name
    jobId: string   // Job ID
  }
  ```

- **add_job_log** - Add a log entry to a job
  ```typescript
  {
    queue: string,   // Queue name
    jobId: string,   // Job ID
    message: string  // Log message
  }
  ```

## BullMQ MCP Examples - How to Use BullMQ with Claude

### Connect to Redis and List Queues

```javascript
// Connect using Redis URL
await use_mcp_tool("bullmq", "connect", {
  id: "local",
  url: "redis://localhost:6379"
});

// Or connect using individual parameters
await use_mcp_tool("bullmq", "connect", {
  id: "local",
  host: "localhost",
  port: 6379,
  password: "mypassword",
  db: 0
});

// Or connect using REDIS_URL environment variable
// (no url parameter needed if REDIS_URL is set)
await use_mcp_tool("bullmq", "connect", {
  id: "local"
});

// List all queues
await use_mcp_tool("bullmq", "list_queues", {});
```

### Add and Monitor a Job

```javascript
// Add a job with delay
await use_mcp_tool("bullmq", "add_job", {
  queue: "email-queue",
  name: "send-welcome-email",
  data: {
    to: "user@example.com",
    subject: "Welcome!",
    template: "welcome"
  },
  opts: {
    delay: 5000,        // Process after 5 seconds
    priority: 1,        // Higher priority (lower number = higher priority)
    attempts: 3,        // Retry up to 3 times
    backoff: {
      type: "exponential",
      delay: 2000
    }
  }
});

// Get job status
await use_mcp_tool("bullmq", "get_job", {
  queue: "email-queue",
  jobId: "1"
});

// Add a custom log entry
await use_mcp_tool("bullmq", "add_job_log", {
  queue: "email-queue",
  jobId: "1",
  message: "Email template rendered successfully"
});

// View job logs
await use_mcp_tool("bullmq", "get_job_logs", {
  queue: "email-queue",
  jobId: "1"
});
```

### Queue Maintenance

```javascript
// Get queue statistics
await use_mcp_tool("bullmq", "stats", {
  queue: "email-queue"
});
// Returns: active, waiting, completed, failed, delayed, paused counts

// Get failed jobs with details
await use_mcp_tool("bullmq", "get_jobs", {
  queue: "email-queue",
  status: "failed",
  start: 0,
  end: 20
});

// Retry a specific failed job
await use_mcp_tool("bullmq", "retry_job", {
  queue: "email-queue",
  jobId: "123"
});

// Clean completed jobs older than 1 hour
await use_mcp_tool("bullmq", "clean_queue", {
  queue: "email-queue",
  grace: 3600000,  // 1 hour in milliseconds
  status: "completed",
  limit: 100       // Clean max 100 jobs
});

// Pause processing
await use_mcp_tool("bullmq", "pause_queue", {
  queue: "email-queue"
});

// Resume processing
await use_mcp_tool("bullmq", "resume_queue", {
  queue: "email-queue"
});

// Completely drain a queue (remove ALL jobs)
await use_mcp_tool("bullmq", "drain_queue", {
  queue: "test-queue"
});
```

### Advanced Job Management

```javascript
// Add a repeating job
await use_mcp_tool("bullmq", "add_job", {
  queue: "metrics-queue",
  name: "collect-metrics",
  data: { source: "api" },
  opts: {
    repeat: {
      pattern: "*/5 * * * *"  // Every 5 minutes (cron syntax)
    }
  }
});

// Promote a delayed job to be processed immediately
await use_mcp_tool("bullmq", "promote_job", {
  queue: "notification-queue",
  jobId: "456"
});

// Get jobs by different statuses
const statuses = ["active", "waiting", "completed", "failed", "delayed"];
for (const status of statuses) {
  await use_mcp_tool("bullmq", "get_jobs", {
    queue: "worker-queue",
    status: status,
    start: 0,
    end: 5
  });
}
```

## Getting Started with BullMQ MCP

### Prerequisites

1. **Redis Server**: Ensure Redis is running locally or accessible remotely
   ```bash
   # Check if Redis is running
   redis-cli ping
   # Should return: PONG
   ```

2. **Claude Desktop**: Install and configure Claude Desktop with the BullMQ MCP server

### Basic Workflow

1. **Connect to Redis**
   ```
   Connect to Redis using the bullmq tool with id "local"
   ```

2. **Explore Queues**
   ```
   List all queues and show me their statistics
   ```

3. **Monitor Jobs**
   ```
   Show me failed jobs in the email-queue
   ```

4. **Manage Jobs**
   ```
   Add a test job to my-queue with some sample data
   ```

### Docker Usage Notes

When using the Docker version:

- **Redis Connection**: Use `host.docker.internal:6379` instead of `localhost:6379` to connect to Redis running on your host
- **Environment Variables**: Set `REDIS_URL=redis://host.docker.internal:6379` for automatic connection
- **Network Access**: The Docker container needs network access to reach your Redis instance
- **Persistence**: The container is ephemeral - all data is stored in Redis, not the container

## Common BullMQ MCP Use Cases

### 1. Monitoring Queue Health

```
Check the health of all my queues - show me which ones have failed or stuck jobs
```

### 2. Debugging Failed Jobs

```
Show me the failed jobs in the payment-queue and their error messages
```

### 3. Retrying Failed Jobs

```
Retry all failed jobs in the notification-queue
```

### 4. Queue Maintenance

```
Clean up completed jobs older than 24 hours from all queues
```

### 5. Managing Multiple Environments

```javascript
// Connect to different Redis instances
await use_mcp_tool("bullmq", "connect", {
  id: "production",
  url: "redis://prod-redis.example.com:6379"
});

await use_mcp_tool("bullmq", "connect", {
  id: "staging",
  url: "redis://staging-redis.example.com:6379"
});

// Switch between connections
await use_mcp_tool("bullmq", "switch_connection", {
  id: "production"
});
```

## Testing the Connection

After configuring Claude Desktop, restart Claude and test the connection:

1. Open Claude Desktop
2. Start a new conversation
3. Test the MCP connection:

```
Can you connect to my local Redis using the bullmq tool? Use connection id "local" with default settings.
```

If successful, you should see a confirmation message. You can then:

- List all available queues
- Check queue statistics
- View job details
- Perform queue operations

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run built version
pnpm start

# Create global link
pnpm link --global
```

## Troubleshooting

### Connection Issues

- **Redis not running**: Ensure Redis is running on the specified host and port
  ```bash
  # Start Redis (macOS with Homebrew)
  brew services start redis
  
  # Start Redis (Linux)
  sudo systemctl start redis
  
  # Test connection
  redis-cli ping
  ```

- **Authentication failed**: Check that the Redis password (if any) is correct
  ```bash
  # Test with password
  redis-cli -a yourpassword ping
  ```

- **Wrong database**: Ensure you're connecting to the correct Redis database number

### Common Errors

- **"No active connection"**: Use the `connect` tool first before other operations
  ```
  First connect to Redis with: connect to Redis using bullmq with id "local"
  ```

- **"Job not found"**: Ensure the job ID exists in the specified queue
  ```
  List jobs in the queue first to see available job IDs
  ```

- **"Queue not found"**: The queue may not exist or have any jobs yet
  ```
  List all queues to see what's available
  ```

- **Connection timeout**: Check firewall settings and Redis bind address
  ```bash
  # Check Redis config
  grep "^bind" /etc/redis/redis.conf
  ```

### MCP Server Issues

- **Server not starting**: Check Claude Desktop configuration file syntax
- **Tools not available**: Restart Claude Desktop after configuration changes
- **Permission denied**: Ensure the MCP server has execute permissions

### Debugging

1. **Enable verbose logging** in Claude Desktop:
   - Run Claude from terminal to see logs
   - macOS: `/Applications/Claude.app/Contents/MacOS/Claude`
   - Windows: Run Claude from Command Prompt
   - Linux: Run from terminal

2. **Test the MCP server directly**:
   ```bash
   # Run the server manually to check for errors
   npx @adamhancock/bullmq-mcp
   ```

3. **Check Redis connection**:
   ```bash
   # Test Redis connectivity
   redis-cli -h localhost -p 6379 ping
   
   # Check Redis info
   redis-cli info clients
   ```

4. **Verify environment variables**:
   ```bash
   # Check if REDIS_URL is set
   echo $REDIS_URL
   ```

## Requirements

- Node.js 18+
- Redis server
- BullMQ-compatible Redis setup

## Why Use BullMQ MCP?

The BullMQ MCP server bridges the gap between AI assistants and BullMQ job queue management. With this MCP integration, you can:

- **Natural Language Queue Management**: Use conversational commands to manage BullMQ queues
- **AI-Powered Debugging**: Let Claude analyze failed jobs and suggest solutions
- **Automated Queue Monitoring**: Set up intelligent alerts and monitoring through AI
- **Cross-Environment Management**: Seamlessly switch between development, staging, and production queues

## BullMQ MCP vs Traditional Tools

| Feature | BullMQ MCP | Traditional CLI/GUI |
|---------|------------|-------------------|
| Natural language commands | ✅ Yes | ❌ No |
| AI-assisted debugging | ✅ Yes | ❌ No |
| Batch operations | ✅ Yes | ⚠️ Limited |
| Learning curve | ✅ Minimal | ⚠️ Moderate |
| Integration with AI tools | ✅ Native | ❌ None |

## Related Projects

- [BullMQ](https://github.com/taskforcesh/bullmq) - The powerful Node.js job queue
- [Model Context Protocol](https://modelcontextprotocol.io) - The protocol enabling AI-tool integration
- [Claude Desktop](https://claude.ai/download) - AI assistant with MCP support

## Contributing

Contributions to the BullMQ MCP server are welcome! Please feel free to submit issues or pull requests to improve this integration.

## Support

For issues related to:
- **BullMQ MCP Server**: [GitHub Issues](https://github.com/adamhancock/bullmq-mcp/issues)
- **BullMQ**: [BullMQ Documentation](https://docs.bullmq.io)
- **MCP Protocol**: [MCP Documentation](https://modelcontextprotocol.io/docs)

## License

MIT

---

**Search Terms**: BullMQ MCP, BullMQ Model Context Protocol, BullMQ Claude, BullMQ AI integration, BullMQ queue management MCP, Redis queue MCP, BullMQ automation, BullMQ natural language, BullMQ Claude Desktop, MCP server for BullMQ