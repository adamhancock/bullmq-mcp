#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { Queue, Worker, QueueEvents, Job } from "bullmq";
import { Redis } from "ioredis";

// Helper function to create Redis connection with TLS support for rediss:// URLs
function createRedisConnection(redisUrl: string, options: any = {}): Redis {
  if (redisUrl.startsWith('rediss://')) {
    // Parse the URL to extract connection details
    const url = new URL(redisUrl);
    
    const redisOptions = {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      db: url.pathname ? parseInt(url.pathname.slice(1)) || 0 : 0,
      ...options,
      // Enable TLS for rediss:// URLs
      tls: {
        // Allow self-signed certificates (common with Heroku, ElastiCache, etc.)
        rejectUnauthorized: false,
        ...options.tls,
      },
    };
    
    // Add authentication if present
    if (url.password) {
      redisOptions.password = url.password;
    }
    
    if (url.username && url.username !== '') {
      redisOptions.username = url.username;
    }
    
    return new Redis(redisOptions);
  } else {
    // For regular redis:// URLs, use the original behavior
    return new Redis(redisUrl, options);
  }
}

interface Connection {
  redis: Redis;
  queues: Map<string, Queue>;
  workers: Map<string, Worker>;
  queueEvents: Map<string, QueueEvents>;
}

const connections = new Map<string, Connection>();
let currentConnectionId: string | null = null;

const server = new Server(
  {
    name: "bullmq-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to get current connection
function getCurrentConnection(): Connection {
  if (!currentConnectionId || !connections.has(currentConnectionId)) {
    throw new Error("No active connection. Use 'connect' first.");
  }
  return connections.get(currentConnectionId)!;
}

// Helper function to get or create queue
function getQueue(queueName: string): Queue {
  const connection = getCurrentConnection();
  
  if (!connection.queues.has(queueName)) {
    const queue = new Queue(queueName, {
      connection: connection.redis.duplicate(),
    });
    connection.queues.set(queueName, queue);
  }
  
  return connection.queues.get(queueName)!;
}

// Tool definitions
const tools: Tool[] = [
  {
    name: "connect",
    description: "Connect to Redis instance. Can use REDIS_URL environment variable if set. When running in Docker, localhost will automatically redirect to host.docker.internal.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Connection identifier",
        },
        url: {
          type: "string",
          description: "Redis URL (e.g., redis://user:pass@localhost:6379/0). If not provided, will use REDIS_URL env var or individual connection parameters.",
        },
        host: {
          type: "string",
          description: "Redis host (ignored if url is provided)",
          default: "localhost",
        },
        port: {
          type: "number",
          description: "Redis port (ignored if url is provided)",
          default: 6379,
        },
        password: {
          type: "string",
          description: "Redis password (ignored if url is provided)",
        },
        db: {
          type: "number",
          description: "Redis database number (ignored if url is provided)",
          default: 0,
        },
      },
      required: ["id"],
    },
  },
  {
    name: "disconnect",
    description: "Disconnect from current Redis instance",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_connections",
    description: "List all saved connections",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "switch_connection",
    description: "Switch to a different connection",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Connection identifier to switch to",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "stats",
    description: "Get queue statistics",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
      },
      required: ["queue"],
    },
  },
  {
    name: "get_jobs",
    description: "Get jobs from queue by status",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
        status: {
          type: "string",
          enum: ["active", "waiting", "completed", "failed", "delayed", "paused", "repeat", "wait"],
          description: "Job status to filter by",
        },
        start: {
          type: "number",
          description: "Start index",
          default: 0,
        },
        end: {
          type: "number",
          description: "End index",
          default: 10,
        },
      },
      required: ["queue", "status"],
    },
  },
  {
    name: "get_job",
    description: "Get a specific job by ID",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
        jobId: {
          type: "string",
          description: "Job ID",
        },
      },
      required: ["queue", "jobId"],
    },
  },
  {
    name: "add_job",
    description: "Add a new job to the queue",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
        name: {
          type: "string",
          description: "Job name",
        },
        data: {
          type: "object",
          description: "Job data (JSON object)",
        },
        opts: {
          type: "object",
          description: "Job options",
          properties: {
            delay: {
              type: "number",
              description: "Delay in milliseconds",
            },
            priority: {
              type: "number",
              description: "Job priority",
            },
            attempts: {
              type: "number",
              description: "Number of attempts",
            },
            backoff: {
              type: "object",
              description: "Backoff configuration",
            },
            removeOnComplete: {
              type: "boolean",
              description: "Remove job when completed",
            },
            removeOnFail: {
              type: "boolean",
              description: "Remove job when failed",
            },
          },
        },
      },
      required: ["queue", "name", "data"],
    },
  },
  {
    name: "remove_job",
    description: "Remove a job from the queue",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
        jobId: {
          type: "string",
          description: "Job ID",
        },
      },
      required: ["queue", "jobId"],
    },
  },
  {
    name: "retry_job",
    description: "Retry a failed job",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
        jobId: {
          type: "string",
          description: "Job ID",
        },
      },
      required: ["queue", "jobId"],
    },
  },
  {
    name: "promote_job",
    description: "Promote a delayed job",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
        jobId: {
          type: "string",
          description: "Job ID",
        },
      },
      required: ["queue", "jobId"],
    },
  },
  {
    name: "clean_queue",
    description: "Clean jobs from queue",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
        grace: {
          type: "number",
          description: "Grace period in milliseconds",
          default: 0,
        },
        limit: {
          type: "number",
          description: "Maximum number of jobs to clean",
          default: 1000,
        },
        status: {
          type: "string",
          enum: ["completed", "failed"],
          description: "Job status to clean",
          default: "completed",
        },
      },
      required: ["queue"],
    },
  },
  {
    name: "pause_queue",
    description: "Pause queue processing",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
      },
      required: ["queue"],
    },
  },
  {
    name: "resume_queue",
    description: "Resume queue processing",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
      },
      required: ["queue"],
    },
  },
  {
    name: "get_job_logs",
    description: "Get logs for a job",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
        jobId: {
          type: "string",
          description: "Job ID",
        },
      },
      required: ["queue", "jobId"],
    },
  },
  {
    name: "add_job_log",
    description: "Add a log entry to a job",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
        jobId: {
          type: "string",
          description: "Job ID",
        },
        message: {
          type: "string",
          description: "Log message",
        },
      },
      required: ["queue", "jobId", "message"],
    },
  },
  {
    name: "list_queues",
    description: "List all queues in the current connection",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Queue name pattern (supports wildcards)",
          default: "*",
        },
      },
    },
  },
  {
    name: "drain_queue",
    description: "Remove all jobs from a queue",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Queue name",
        },
      },
      required: ["queue"],
    },
  },
  {
    name: "move_failed_jobs_to_dlq",
    description: "Move failed jobs to a dead letter queue with TTL. Designed for cleaning up old failed jobs that have been manually resolved.",
    inputSchema: {
      type: "object",
      properties: {
        queue: {
          type: "string",
          description: "Source queue name",
        },
        jobName: {
          type: "string", 
          description: "Specific job name to filter (e.g., 'upsertHubspotContact')",
        },
        beforeTimestamp: {
          type: "number",
          description: "Unix timestamp in milliseconds - jobs created before this will be moved",
        },
        dlqKey: {
          type: "string",
          description: "Dead letter queue Redis key (outside BullMQ namespace)",
          default: "dlq:failed_jobs",
        },
        ttlDays: {
          type: "number",
          description: "TTL in days for dead letter queue entries",
          default: 30,
        },
        dryRun: {
          type: "boolean",
          description: "Preview what would be moved without actually moving",
          default: false,
        },
      },
      required: ["queue", "jobName", "beforeTimestamp"],
    },
  },
  {
    name: "query_dead_letter_queue",
    description: "Query jobs in the dead letter queue",
    inputSchema: {
      type: "object", 
      properties: {
        dlqKey: {
          type: "string",
          description: "Dead letter queue Redis key",
          default: "dlq:failed_jobs",
        },
        jobName: {
          type: "string",
          description: "Filter by job name (optional)",
        },
        limit: {
          type: "number",
          description: "Max number of jobs to return",
          default: 10,
        },
      },
    },
  },
];

// Register tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "connect": {
        const { id, host, port, password, db, url } = args as any;
        
        // Check if running in Docker
        const isDocker = process.env.DOCKER === 'true' || !!process.env.DOCKER_HOST;
        
        // Check for Redis URL in args or environment
        let redisUrl = url || process.env.REDIS_URL;
        
        // Auto-redirect localhost to Docker host when in Docker
        if (isDocker && redisUrl && redisUrl.includes('localhost')) {
          redisUrl = redisUrl.replace('localhost', 'host.docker.internal');
        }
        
        // Determine final host
        let finalHost = host || "localhost";
        if (isDocker && finalHost === "localhost") {
          finalHost = "host.docker.internal";
        }
        
        let redis: Redis;
        if (redisUrl) {
          redis = createRedisConnection(redisUrl, {
            maxRetriesPerRequest: null,
            connectTimeout: 10000, // 10 second timeout
            commandTimeout: 5000,  // 5 second command timeout
          });
        } else {
          redis = new Redis({
            host: finalHost,
            port: port || 6379,
            password,
            db: db || 0,
            maxRetriesPerRequest: null,
            connectTimeout: 10000, // 10 second timeout
            commandTimeout: 5000,  // 5 second command timeout
          });
        }

        // Test connection
        await redis.ping();

        connections.set(id, {
          redis,
          queues: new Map(),
          workers: new Map(),
          queueEvents: new Map(),
        });
        
        currentConnectionId = id;
        
        let connectionInfo = redisUrl 
          ? `Connected to Redis at ${redisUrl} (connection: ${id})`
          : `Connected to Redis at ${finalHost}:${port || 6379} (connection: ${id})`;
        
        // Add Docker redirect notice if applicable
        if (isDocker && (finalHost === "host.docker.internal" || (redisUrl && redisUrl.includes('host.docker.internal')))) {
          connectionInfo += "\n(Note: Automatically redirected localhost to host.docker.internal for Docker environment)";
        }
        
        return {
          content: [
            {
              type: "text",
              text: connectionInfo,
            },
          ],
        };
      }

      case "disconnect": {
        if (!currentConnectionId) {
          throw new Error("No active connection");
        }

        const connection = connections.get(currentConnectionId);
        if (connection) {
          // Close all queues, workers, and events
          for (const queue of connection.queues.values()) {
            await queue.close();
          }
          for (const worker of connection.workers.values()) {
            await worker.close();
          }
          for (const queueEvents of connection.queueEvents.values()) {
            await queueEvents.close();
          }
          
          // Close Redis connection
          connection.redis.disconnect();
          connections.delete(currentConnectionId);
        }

        const disconnectedId = currentConnectionId;
        currentConnectionId = null;

        return {
          content: [
            {
              type: "text",
              text: `Disconnected from connection: ${disconnectedId}`,
            },
          ],
        };
      }

      case "list_connections": {
        const connectionList = Array.from(connections.keys()).map((id) => ({
          id,
          active: id === currentConnectionId,
        }));

        return {
          content: [
            {
              type: "text",
              text: connectionList.length === 0 
                ? "No connections available"
                : `Connections:\n${connectionList
                    .map((c) => `- ${c.id}${c.active ? " (active)" : ""}`)
                    .join("\n")}`,
            },
          ],
        };
      }

      case "switch_connection": {
        const { id } = args as any;
        
        if (!connections.has(id)) {
          throw new Error(`Connection '${id}' not found`);
        }

        currentConnectionId = id;

        return {
          content: [
            {
              type: "text",
              text: `Switched to connection: ${id}`,
            },
          ],
        };
      }

      case "stats": {
        const { queue: queueName } = args as any;
        const queue = getQueue(queueName);
        
        const counts = await queue.getJobCounts();
        
        return {
          content: [
            {
              type: "text",
              text: `Queue: ${queueName}\n${Object.entries(counts)
                .map(([status, count]) => `- ${status}: ${count}`)
                .join("\n")}`,
            },
          ],
        };
      }

      case "get_jobs": {
        const { queue: queueName, status, start = 0, end = 10 } = args as any;
        const queue = getQueue(queueName);
        
        let jobs: Job[] = [];
        
        switch (status) {
          case "active":
            jobs = await queue.getActive(start, end);
            break;
          case "waiting":
            jobs = await queue.getWaiting(start, end);
            break;
          case "completed":
            jobs = await queue.getCompleted(start, end);
            break;
          case "failed":
            jobs = await queue.getFailed(start, end);
            break;
          case "delayed":
            jobs = await queue.getDelayed(start, end);
            break;
          case "paused":
            jobs = await queue.getWaiting(start, end); // BullMQ doesn't have getPaused
            break;
          case "repeat":
            // getRepeatableJobs returns different type, handle separately
            const repeatableJobs = await queue.getRepeatableJobs(start, end);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(repeatableJobs, null, 2),
                },
              ],
            };
          case "wait":
            jobs = await queue.getWaitingChildren(start, end);
            break;
        }

        const jobList = jobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          progress: job.progress,
          timestamp: job.timestamp,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason,
          returnvalue: job.returnvalue,
        }));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(jobList, null, 2),
            },
          ],
        };
      }

      case "get_job": {
        const { queue: queueName, jobId } = args as any;
        const queue = getQueue(queueName);
        
        const job = await queue.getJob(jobId);
        
        if (!job) {
          throw new Error(`Job ${jobId} not found in queue ${queueName}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: job.id,
                name: job.name,
                data: job.data,
                opts: job.opts,
                progress: job.progress,
                timestamp: job.timestamp,
                attemptsMade: job.attemptsMade,
                failedReason: job.failedReason,
                stacktrace: job.stacktrace,
                returnvalue: job.returnvalue,
                finishedOn: job.finishedOn,
                processedOn: job.processedOn,
              }, null, 2),
            },
          ],
        };
      }

      case "add_job": {
        const { queue: queueName, name: jobName, data, opts = {} } = args as any;
        const queue = getQueue(queueName);
        
        const job = await queue.add(jobName, data, opts);
        
        return {
          content: [
            {
              type: "text",
              text: `Job added successfully:\n- ID: ${job.id}\n- Name: ${job.name}\n- Queue: ${queueName}`,
            },
          ],
        };
      }

      case "remove_job": {
        const { queue: queueName, jobId } = args as any;
        const queue = getQueue(queueName);
        
        const job = await queue.getJob(jobId);
        if (!job) {
          throw new Error(`Job ${jobId} not found in queue ${queueName}`);
        }
        
        await job.remove();
        
        return {
          content: [
            {
              type: "text",
              text: `Job ${jobId} removed from queue ${queueName}`,
            },
          ],
        };
      }

      case "retry_job": {
        const { queue: queueName, jobId } = args as any;
        const queue = getQueue(queueName);
        
        const job = await queue.getJob(jobId);
        if (!job) {
          throw new Error(`Job ${jobId} not found in queue ${queueName}`);
        }
        
        await job.retry();
        
        return {
          content: [
            {
              type: "text",
              text: `Job ${jobId} retried in queue ${queueName}`,
            },
          ],
        };
      }

      case "promote_job": {
        const { queue: queueName, jobId } = args as any;
        const queue = getQueue(queueName);
        
        const job = await queue.getJob(jobId);
        if (!job) {
          throw new Error(`Job ${jobId} not found in queue ${queueName}`);
        }
        
        await job.promote();
        
        return {
          content: [
            {
              type: "text",
              text: `Job ${jobId} promoted in queue ${queueName}`,
            },
          ],
        };
      }

      case "clean_queue": {
        const { queue: queueName, grace = 0, limit = 1000, status = "completed" } = args as any;
        const queue = getQueue(queueName);
        
        const cleaned = await queue.clean(grace, limit, status);
        
        return {
          content: [
            {
              type: "text",
              text: `Cleaned ${cleaned.length} ${status} jobs from queue ${queueName}`,
            },
          ],
        };
      }

      case "pause_queue": {
        const { queue: queueName } = args as any;
        const queue = getQueue(queueName);
        
        await queue.pause();
        
        return {
          content: [
            {
              type: "text",
              text: `Queue ${queueName} paused`,
            },
          ],
        };
      }

      case "resume_queue": {
        const { queue: queueName } = args as any;
        const queue = getQueue(queueName);
        
        await queue.resume();
        
        return {
          content: [
            {
              type: "text",
              text: `Queue ${queueName} resumed`,
            },
          ],
        };
      }

      case "get_job_logs": {
        const { queue: queueName, jobId } = args as any;
        const queue = getQueue(queueName);
        
        const job = await queue.getJob(jobId);
        if (!job) {
          throw new Error(`Job ${jobId} not found in queue ${queueName}`);
        }
        
        const logs = await queue.getJobLogs(jobId);
        
        return {
          content: [
            {
              type: "text",
              text: logs.logs.join("\n") || "No logs available",
            },
          ],
        };
      }

      case "add_job_log": {
        const { queue: queueName, jobId, message } = args as any;
        const queue = getQueue(queueName);
        
        const job = await queue.getJob(jobId);
        if (!job) {
          throw new Error(`Job ${jobId} not found in queue ${queueName}`);
        }
        
        await job.log(message);
        
        return {
          content: [
            {
              type: "text",
              text: `Log added to job ${jobId}`,
            },
          ],
        };
      }

      case "list_queues": {
        const { pattern = "*" } = args as any;
        const connection = getCurrentConnection();
        
        // Get all keys matching bull:* pattern
        const keys = await connection.redis.keys(`bull:${pattern}:*`);
        
        // Extract unique queue names
        const queueNames = new Set<string>();
        for (const key of keys) {
          const match = key.match(/^bull:([^:]+):/);
          if (match) {
            queueNames.add(match[1]);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: queueNames.size === 0 
                ? "No queues found"
                : `Queues:\n${Array.from(queueNames).sort().map((q) => `- ${q}`).join("\n")}`,
            },
          ],
        };
      }

      case "drain_queue": {
        const { queue: queueName } = args as any;
        const queue = getQueue(queueName);
        
        await queue.drain();
        
        return {
          content: [
            {
              type: "text",
              text: `Queue ${queueName} drained`,
            },
          ],
        };
      }

      case "move_failed_jobs_to_dlq": {
        const { 
          queue: queueName, 
          jobName, 
          beforeTimestamp, 
          dlqKey = "dlq:failed_jobs", 
          ttlDays = 30,
          dryRun = false 
        } = args as any;
        
        const queue = getQueue(queueName);
        const connection = getCurrentConnection();
        const redis = connection.redis;
        
        // Get all failed jobs in batches
        const batchSize = 100;
        let start = 0;
        let totalMoved = 0;
        let movedJobs: any[] = [];
        
        while (true) {
          const failedJobs = await queue.getFailed(start, start + batchSize - 1);
          if (failedJobs.length === 0) break;
          
          const jobsToMove = failedJobs.filter(job => 
            job.name === jobName && 
            job.timestamp < beforeTimestamp
          );
          
          if (jobsToMove.length === 0) {
            start += batchSize;
            continue;
          }
          
          for (const job of jobsToMove) {
            const dlqEntry = {
              originalJobId: job.id,
              jobName: job.name,
              data: job.data,
              failedReason: job.failedReason,
              attemptsMade: job.attemptsMade,
              timestamp: job.timestamp,
              movedAt: Date.now(),
              originalQueue: queueName,
              stacktrace: job.stacktrace,
            };
            
            if (!dryRun) {
              // Store in dead letter queue with TTL
              const dlqEntryKey = `${dlqKey}:${job.id}`;
              await redis.setex(
                dlqEntryKey, 
                ttlDays * 24 * 60 * 60, // Convert days to seconds
                JSON.stringify(dlqEntry)
              );
              
              // Remove from BullMQ failed queue
              await job.remove();
            }
            
            movedJobs.push({
              jobId: job.id,
              timestamp: job.timestamp,
              email: job.data?.properties?.email || 'N/A',
              failedReason: job.failedReason,
            });
            totalMoved++;
          }
          
          start += batchSize;
        }
        
        // Also create an index for easier querying
        if (!dryRun && totalMoved > 0) {
          const indexKey = `${dlqKey}:index:${jobName}`;
          const indexEntry = {
            jobName,
            totalJobs: totalMoved,
            movedAt: Date.now(),
            beforeTimestamp,
            ttlDays,
          };
          await redis.setex(
            indexKey,
            ttlDays * 24 * 60 * 60,
            JSON.stringify(indexEntry)
          );
        }
        
        return {
          content: [
            {
              type: "text",
              text: dryRun 
                ? `DRY RUN: Would move ${totalMoved} failed "${jobName}" jobs created before ${new Date(beforeTimestamp).toISOString()}\n\nSample jobs:\n${movedJobs.slice(0, 5).map(j => `- Job ${j.jobId}: ${j.email} (${j.failedReason})`).join('\n')}`
                : `Successfully moved ${totalMoved} failed "${jobName}" jobs to dead letter queue "${dlqKey}" with ${ttlDays} day TTL\n\nMoved jobs will auto-expire on: ${new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()}`,
            },
          ],
        };
      }

      case "query_dead_letter_queue": {
        const { dlqKey = "dlq:failed_jobs", jobName, limit = 10 } = args as any;
        const connection = getCurrentConnection();
        const redis = connection.redis;
        
        // Get keys matching the pattern
        const pattern = jobName ? `${dlqKey}:*` : `${dlqKey}:*`;
        const keys = await redis.keys(pattern);
        
        // Filter out index keys
        const jobKeys = keys.filter(key => !key.includes(':index:'));
        
        const jobs = [];
        for (let i = 0; i < Math.min(jobKeys.length, limit); i++) {
          const jobData = await redis.get(jobKeys[i]);
          if (jobData) {
            const parsed = JSON.parse(jobData);
            if (!jobName || parsed.jobName === jobName) {
              jobs.push(parsed);
            }
          }
        }
        
        return {
          content: [
            {
              type: "text",
              text: jobs.length === 0 
                ? `No jobs found in dead letter queue "${dlqKey}"${jobName ? ` for job type "${jobName}"` : ''}`
                : `Found ${jobs.length} jobs in dead letter queue:\n\n${jobs.map(job => 
                    `Job ${job.originalJobId} (${job.jobName}):\n- Email: ${job.data?.properties?.email || 'N/A'}\n- Failed: ${job.failedReason}\n- Moved: ${new Date(job.movedAt).toISOString()}`
                  ).join('\n\n')}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Don't log to stderr as it interferes with MCP protocol
}

// Cleanup on exit
process.on("SIGINT", async () => {
  for (const [id, connection] of connections) {
    for (const queue of connection.queues.values()) {
      await queue.close();
    }
    for (const worker of connection.workers.values()) {
      await worker.close();
    }
    for (const queueEvents of connection.queueEvents.values()) {
      await queueEvents.close();
    }
    connection.redis.disconnect();
  }
  process.exit(0);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});