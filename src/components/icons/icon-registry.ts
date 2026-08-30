// Icon registry — single source of truth for all dataflow icon node presets.
// 2-level hierarchy: provider → category → icons
// Used by the IconSidebar UI and the generate-dataflow AI skill.

export interface IconPreset {
  id: string              // "lucide:Database", "aws:ec2", "azure:vm"
  label: string           // human-readable: "Database", "EC2", "Virtual Machine"
  provider: string        // "general", "aws", "azure"
  category: string        // "Compute", "Storage", "Network", etc.
  keywords: string[]      // for search matching
  lucideBase?: string     // For cloud icons: which Lucide icon to use as base shape
  badge?: string          // Short badge text overlay: "EC2", "S3", "RDS"
  tint?: string           // Provider accent color
}

// Provider definitions
export const PROVIDERS = [
  { id: 'general', label: 'General', color: '#475569' },
  { id: 'seq',     label: 'Sequence', color: '#6366F1' },
  { id: 'k8s',     label: 'Kubernetes', color: '#326CE5' },
  { id: 'aws',     label: 'AWS',     color: '#FF9900' },
  { id: 'azure',   label: 'Azure',   color: '#0078D4' },
] as const

export type ProviderId = typeof PROVIDERS[number]['id']

// All categories across providers
export const ALL_CATEGORIES = [
  'People', 'Compute', 'Storage', 'Network', 'Cloud',
  'Security', 'Messaging', 'Integration', 'Misc',
] as const

const K8S_TINT = '#326CE5'
const AWS_TINT = '#FF9900'
const AZURE_TINT = '#0078D4'

export const ICON_REGISTRY: IconPreset[] = [
  // ═══════════════════════════════════════════
  // GENERAL (Lucide icons)
  // ═══════════════════════════════════════════

  // People
  { id: 'lucide:User',        label: 'User',         provider: 'general', category: 'People',      keywords: ['person', 'account', 'profile'] },
  { id: 'lucide:Users',       label: 'Users',        provider: 'general', category: 'People',      keywords: ['group', 'team', 'members'] },
  { id: 'lucide:Building2',   label: 'Organization', provider: 'general', category: 'People',      keywords: ['company', 'org', 'enterprise', 'tenant'] },
  { id: 'lucide:Contact',     label: 'Contact',      provider: 'general', category: 'People',      keywords: ['customer', 'client', 'crm'] },

  // Compute
  { id: 'lucide:Server',      label: 'Server',       provider: 'general', category: 'Compute',     keywords: ['host', 'instance', 'machine', 'backend'] },
  { id: 'lucide:Cpu',         label: 'CPU',          provider: 'general', category: 'Compute',     keywords: ['processor', 'compute', 'worker'] },
  { id: 'lucide:Monitor',     label: 'Desktop',      provider: 'general', category: 'Compute',     keywords: ['pc', 'workstation', 'screen'] },
  { id: 'lucide:Laptop',      label: 'Laptop',       provider: 'general', category: 'Compute',     keywords: ['notebook', 'computer', 'client'] },
  { id: 'lucide:Smartphone',  label: 'Phone',        provider: 'general', category: 'Compute',     keywords: ['mobile', 'device', 'ios', 'android', 'app'] },
  { id: 'lucide:Tablet',      label: 'Tablet',       provider: 'general', category: 'Compute',     keywords: ['ipad', 'device'] },
  { id: 'lucide:Terminal',    label: 'Terminal',      provider: 'general', category: 'Compute',     keywords: ['cli', 'shell', 'console', 'command'] },
  { id: 'lucide:Container',   label: 'Container',    provider: 'general', category: 'Compute',     keywords: ['docker', 'pod', 'k8s', 'kubernetes'] },

  // Storage
  { id: 'lucide:Database',    label: 'Database',     provider: 'general', category: 'Storage',     keywords: ['db', 'sql', 'postgres', 'mysql', 'sqlite', 'table'] },
  { id: 'lucide:HardDrive',   label: 'Disk',         provider: 'general', category: 'Storage',     keywords: ['storage', 'volume', 'drive', 'block'] },
  { id: 'lucide:Archive',     label: 'Archive',      provider: 'general', category: 'Storage',     keywords: ['backup', 'cold storage', 'glacier'] },
  { id: 'lucide:FolderOpen',  label: 'File Storage',  provider: 'general', category: 'Storage',    keywords: ['blob', 'object store', 'files', 's3', 'bucket'] },
  { id: 'lucide:MemoryStick', label: 'Cache',        provider: 'general', category: 'Storage',     keywords: ['redis', 'memcached', 'cache', 'memory'] },

  // Network
  { id: 'lucide:Globe',       label: 'Internet',     provider: 'general', category: 'Network',     keywords: ['web', 'www', 'public', 'dns', 'domain'] },
  { id: 'lucide:Network',     label: 'Network',      provider: 'general', category: 'Network',     keywords: ['vpc', 'subnet', 'lan', 'vnet'] },
  { id: 'lucide:Wifi',        label: 'Wireless',     provider: 'general', category: 'Network',     keywords: ['wifi', 'signal', 'iot'] },
  { id: 'lucide:Router',      label: 'Router',       provider: 'general', category: 'Network',     keywords: ['gateway', 'load balancer', 'proxy', 'alb', 'nlb'] },
  { id: 'lucide:Cable',       label: 'Connection',   provider: 'general', category: 'Network',     keywords: ['link', 'wire', 'cable', 'pipe'] },

  // Cloud
  { id: 'lucide:Cloud',       label: 'Cloud',        provider: 'general', category: 'Cloud',       keywords: ['cloud', 'saas', 'hosted', 'aws', 'gcp', 'azure'] },
  { id: 'lucide:CloudCog',    label: 'Cloud Service', provider: 'general', category: 'Cloud',      keywords: ['cloud config', 'managed service', 'paas'] },
  { id: 'lucide:CloudUpload', label: 'Upload',       provider: 'general', category: 'Cloud',       keywords: ['deploy', 'publish', 'push'] },
  { id: 'lucide:CloudDownload', label: 'Download',   provider: 'general', category: 'Cloud',       keywords: ['pull', 'fetch', 'sync'] },

  // Security
  { id: 'lucide:Shield',      label: 'Shield',       provider: 'general', category: 'Security',    keywords: ['security', 'firewall', 'waf', 'protection'] },
  { id: 'lucide:Lock',        label: 'Lock',         provider: 'general', category: 'Security',    keywords: ['auth', 'encrypted', 'private', 'ssl'] },
  { id: 'lucide:Key',         label: 'Key',          provider: 'general', category: 'Security',    keywords: ['secret', 'credential', 'token', 'api key'] },
  { id: 'lucide:ShieldCheck', label: 'Verified',     provider: 'general', category: 'Security',    keywords: ['cert', 'verified', 'iam', 'identity'] },
  { id: 'lucide:Fingerprint', label: 'Auth',         provider: 'general', category: 'Security',    keywords: ['biometric', 'authentication', 'oauth', 'sso'] },

  // Messaging
  { id: 'lucide:Mail',        label: 'Email',        provider: 'general', category: 'Messaging',   keywords: ['email', 'smtp', 'ses', 'notification'] },
  { id: 'lucide:MessageSquare', label: 'Chat',       provider: 'general', category: 'Messaging',   keywords: ['message', 'chat', 'slack', 'websocket'] },
  { id: 'lucide:Bell',        label: 'Notification', provider: 'general', category: 'Messaging',   keywords: ['alert', 'push', 'notify', 'sns'] },
  { id: 'lucide:Send',        label: 'Send',         provider: 'general', category: 'Messaging',   keywords: ['publish', 'emit', 'dispatch'] },

  // Integration
  { id: 'lucide:Webhook',     label: 'Webhook',      provider: 'general', category: 'Integration', keywords: ['hook', 'callback', 'event'] },
  { id: 'lucide:Blocks',      label: 'Queue',        provider: 'general', category: 'Integration', keywords: ['queue', 'message broker', 'sqs', 'rabbitmq', 'kafka'] },
  { id: 'lucide:Workflow',    label: 'Workflow',     provider: 'general', category: 'Integration', keywords: ['pipeline', 'orchestration', 'step function', 'dag'] },
  { id: 'lucide:Plug',        label: 'API',          provider: 'general', category: 'Integration', keywords: ['api', 'endpoint', 'rest', 'graphql'] },
  { id: 'lucide:GitBranch',   label: 'Git',          provider: 'general', category: 'Integration', keywords: ['git', 'repo', 'vcs', 'branch', 'ci'] },
  { id: 'lucide:RefreshCcw',  label: 'Sync',         provider: 'general', category: 'Integration', keywords: ['sync', 'replicate', 'cdc', 'etl'] },

  // Misc
  { id: 'lucide:Layers',      label: 'Layers',       provider: 'general', category: 'Misc',        keywords: ['stack', 'tier', 'layer', 'middleware'] },
  { id: 'lucide:Boxes',       label: 'Microservices', provider: 'general', category: 'Misc',       keywords: ['services', 'modules', 'components'] },
  { id: 'lucide:Cog',         label: 'Config',       provider: 'general', category: 'Misc',        keywords: ['settings', 'config', 'env', 'parameters'] },
  { id: 'lucide:Zap',         label: 'Function',     provider: 'general', category: 'Misc',        keywords: ['lambda', 'function', 'serverless', 'trigger'] },
  { id: 'lucide:BarChart3',   label: 'Analytics',    provider: 'general', category: 'Misc',        keywords: ['metrics', 'dashboard', 'monitoring', 'cloudwatch'] },
  { id: 'lucide:FileText',    label: 'Document',     provider: 'general', category: 'Misc',        keywords: ['doc', 'log', 'file', 'report'] },
  { id: 'lucide:Clock',       label: 'Scheduler',    provider: 'general', category: 'Misc',        keywords: ['cron', 'timer', 'schedule', 'eventbridge'] },
  { id: 'lucide:Sparkles',    label: 'AI/ML',        provider: 'general', category: 'Misc',        keywords: ['ai', 'ml', 'model', 'inference', 'bedrock', 'sagemaker'] },

  // ═══════════════════════════════════════════
  // SEQUENCE (Number icons 1–20)
  // ═══════════════════════════════════════════

  { id: 'seq:1',  label: '1',  provider: 'seq', category: 'Misc', keywords: ['one', 'first', 'step 1', 'number', 'sequence'] },
  { id: 'seq:2',  label: '2',  provider: 'seq', category: 'Misc', keywords: ['two', 'second', 'step 2', 'number', 'sequence'] },
  { id: 'seq:3',  label: '3',  provider: 'seq', category: 'Misc', keywords: ['three', 'third', 'step 3', 'number', 'sequence'] },
  { id: 'seq:4',  label: '4',  provider: 'seq', category: 'Misc', keywords: ['four', 'fourth', 'step 4', 'number', 'sequence'] },
  { id: 'seq:5',  label: '5',  provider: 'seq', category: 'Misc', keywords: ['five', 'fifth', 'step 5', 'number', 'sequence'] },
  { id: 'seq:6',  label: '6',  provider: 'seq', category: 'Misc', keywords: ['six', 'sixth', 'step 6', 'number', 'sequence'] },
  { id: 'seq:7',  label: '7',  provider: 'seq', category: 'Misc', keywords: ['seven', 'seventh', 'step 7', 'number', 'sequence'] },
  { id: 'seq:8',  label: '8',  provider: 'seq', category: 'Misc', keywords: ['eight', 'eighth', 'step 8', 'number', 'sequence'] },
  { id: 'seq:9',  label: '9',  provider: 'seq', category: 'Misc', keywords: ['nine', 'ninth', 'step 9', 'number', 'sequence'] },
  { id: 'seq:10', label: '10', provider: 'seq', category: 'Misc', keywords: ['ten', 'tenth', 'step 10', 'number', 'sequence'] },
  { id: 'seq:11', label: '11', provider: 'seq', category: 'Misc', keywords: ['eleven', 'step 11', 'number', 'sequence'] },
  { id: 'seq:12', label: '12', provider: 'seq', category: 'Misc', keywords: ['twelve', 'step 12', 'number', 'sequence'] },
  { id: 'seq:13', label: '13', provider: 'seq', category: 'Misc', keywords: ['thirteen', 'step 13', 'number', 'sequence'] },
  { id: 'seq:14', label: '14', provider: 'seq', category: 'Misc', keywords: ['fourteen', 'step 14', 'number', 'sequence'] },
  { id: 'seq:15', label: '15', provider: 'seq', category: 'Misc', keywords: ['fifteen', 'step 15', 'number', 'sequence'] },
  { id: 'seq:16', label: '16', provider: 'seq', category: 'Misc', keywords: ['sixteen', 'step 16', 'number', 'sequence'] },
  { id: 'seq:17', label: '17', provider: 'seq', category: 'Misc', keywords: ['seventeen', 'step 17', 'number', 'sequence'] },
  { id: 'seq:18', label: '18', provider: 'seq', category: 'Misc', keywords: ['eighteen', 'step 18', 'number', 'sequence'] },
  { id: 'seq:19', label: '19', provider: 'seq', category: 'Misc', keywords: ['nineteen', 'step 19', 'number', 'sequence'] },
  { id: 'seq:20', label: '20', provider: 'seq', category: 'Misc', keywords: ['twenty', 'step 20', 'number', 'sequence'] },

  // ═══════════════════════════════════════════
  // KUBERNETES (K8s)
  // ═══════════════════════════════════════════

  // K8s Compute / Workloads
  { id: 'k8s:pod',            label: 'Pod',             provider: 'k8s', category: 'Compute',     keywords: ['pod', 'container', 'workload'],                    lucideBase: 'Container', badge: 'Pod', tint: K8S_TINT },
  { id: 'k8s:deployment',     label: 'Deployment',      provider: 'k8s', category: 'Compute',     keywords: ['deployment', 'deploy', 'replica', 'rollout'],      lucideBase: 'Boxes',     badge: 'Dep', tint: K8S_TINT },
  { id: 'k8s:statefulset',    label: 'StatefulSet',     provider: 'k8s', category: 'Compute',     keywords: ['statefulset', 'stateful', 'ordered'],              lucideBase: 'Boxes',     badge: 'SS',  tint: K8S_TINT },
  { id: 'k8s:daemonset',      label: 'DaemonSet',       provider: 'k8s', category: 'Compute',     keywords: ['daemonset', 'daemon', 'node agent'],               lucideBase: 'Boxes',     badge: 'DS',  tint: K8S_TINT },
  { id: 'k8s:replicaset',     label: 'ReplicaSet',      provider: 'k8s', category: 'Compute',     keywords: ['replicaset', 'replica', 'scaling'],                lucideBase: 'Boxes',     badge: 'RS',  tint: K8S_TINT },
  { id: 'k8s:job',            label: 'Job',             provider: 'k8s', category: 'Compute',     keywords: ['job', 'batch', 'task'],                            lucideBase: 'Zap',       badge: 'Job', tint: K8S_TINT },
  { id: 'k8s:cronjob',        label: 'CronJob',         provider: 'k8s', category: 'Compute',     keywords: ['cronjob', 'cron', 'schedule', 'periodic'],         lucideBase: 'Clock',     badge: 'CJ',  tint: K8S_TINT },
  { id: 'k8s:node',           label: 'Node',            provider: 'k8s', category: 'Compute',     keywords: ['node', 'worker', 'master', 'control plane'],       lucideBase: 'Server',    badge: 'Nod', tint: K8S_TINT },
  { id: 'k8s:hpa',            label: 'HPA',             provider: 'k8s', category: 'Compute',     keywords: ['hpa', 'autoscaler', 'horizontal pod autoscaler'],  lucideBase: 'RefreshCcw', badge: 'HPA', tint: K8S_TINT },

  // K8s Network
  { id: 'k8s:service',        label: 'Service',         provider: 'k8s', category: 'Network',     keywords: ['service', 'clusterip', 'nodeport', 'loadbalancer'], lucideBase: 'Router',   badge: 'Svc', tint: K8S_TINT },
  { id: 'k8s:ingress',        label: 'Ingress',         provider: 'k8s', category: 'Network',     keywords: ['ingress', 'route', 'http', 'tls', 'nginx'],        lucideBase: 'Globe',    badge: 'Ing', tint: K8S_TINT },
  { id: 'k8s:networkpolicy',  label: 'NetworkPolicy',   provider: 'k8s', category: 'Network',     keywords: ['networkpolicy', 'network policy', 'firewall'],     lucideBase: 'Shield',   badge: 'NP',  tint: K8S_TINT },
  { id: 'k8s:endpoint',       label: 'Endpoint',        provider: 'k8s', category: 'Network',     keywords: ['endpoint', 'endpoints', 'target'],                 lucideBase: 'Plug',     badge: 'EP',  tint: K8S_TINT },

  // K8s Storage
  { id: 'k8s:pv',             label: 'PersistentVolume', provider: 'k8s', category: 'Storage',    keywords: ['pv', 'persistent volume', 'volume'],               lucideBase: 'HardDrive', badge: 'PV',  tint: K8S_TINT },
  { id: 'k8s:pvc',            label: 'PVC',             provider: 'k8s', category: 'Storage',     keywords: ['pvc', 'persistent volume claim', 'volume claim'],  lucideBase: 'HardDrive', badge: 'PVC', tint: K8S_TINT },
  { id: 'k8s:storageclass',   label: 'StorageClass',    provider: 'k8s', category: 'Storage',     keywords: ['storageclass', 'storage class', 'provisioner'],    lucideBase: 'Database',  badge: 'SC',  tint: K8S_TINT },

  // K8s Security / Config
  { id: 'k8s:secret',         label: 'Secret',          provider: 'k8s', category: 'Security',    keywords: ['secret', 'credential', 'tls', 'opaque'],           lucideBase: 'Lock',     badge: 'Sec', tint: K8S_TINT },
  { id: 'k8s:configmap',      label: 'ConfigMap',       provider: 'k8s', category: 'Security',    keywords: ['configmap', 'config', 'environment'],              lucideBase: 'Cog',      badge: 'CM',  tint: K8S_TINT },
  { id: 'k8s:sa',             label: 'ServiceAccount',  provider: 'k8s', category: 'Security',    keywords: ['serviceaccount', 'service account', 'rbac'],       lucideBase: 'ShieldCheck', badge: 'SA', tint: K8S_TINT },
  { id: 'k8s:role',           label: 'Role',            provider: 'k8s', category: 'Security',    keywords: ['role', 'clusterrole', 'rbac', 'permission'],       lucideBase: 'Key',      badge: 'Rol', tint: K8S_TINT },

  // K8s Misc
  { id: 'k8s:crd',            label: 'CRD',             provider: 'k8s', category: 'Misc',        keywords: ['crd', 'custom resource', 'custom', 'operator', 'cr'], lucideBase: 'Blocks',  badge: 'CRD', tint: K8S_TINT },
  { id: 'k8s:k8s',            label: 'Kubernetes',      provider: 'k8s', category: 'Misc',        keywords: ['kubernetes', 'k8s', 'cluster', 'generic'],            lucideBase: 'Container', badge: 'K8s', tint: K8S_TINT },

  // ═══════════════════════════════════════════
  // AWS
  // ═══════════════════════════════════════════

  // AWS Compute
  { id: 'aws:ec2',            label: 'EC2',           provider: 'aws', category: 'Compute',  keywords: ['ec2', 'instance', 'virtual machine', 'server'], lucideBase: 'Server',    badge: 'EC2',  tint: AWS_TINT },
  { id: 'aws:lambda',         label: 'Lambda',        provider: 'aws', category: 'Compute',  keywords: ['lambda', 'serverless', 'function'],             lucideBase: 'Zap',      badge: 'λ',    tint: AWS_TINT },
  { id: 'aws:ecs',            label: 'ECS',           provider: 'aws', category: 'Compute',  keywords: ['ecs', 'container', 'docker', 'fargate'],        lucideBase: 'Container', badge: 'ECS', tint: AWS_TINT },
  { id: 'aws:fargate',        label: 'Fargate',       provider: 'aws', category: 'Compute',  keywords: ['fargate', 'serverless container'],               lucideBase: 'Container', badge: 'FG',  tint: AWS_TINT },
  { id: 'aws:eks',            label: 'EKS',           provider: 'aws', category: 'Compute',  keywords: ['eks', 'kubernetes', 'k8s'],                     lucideBase: 'Container', badge: 'EKS', tint: AWS_TINT },
  { id: 'aws:eb',             label: 'Elastic Beanstalk', provider: 'aws', category: 'Compute', keywords: ['beanstalk', 'paas'],                         lucideBase: 'Server',    badge: 'EB',  tint: AWS_TINT },

  // AWS Storage
  { id: 'aws:s3',             label: 'S3',            provider: 'aws', category: 'Storage',  keywords: ['s3', 'bucket', 'object storage', 'blob'],        lucideBase: 'FolderOpen', badge: 'S3', tint: AWS_TINT },
  { id: 'aws:rds',            label: 'RDS',           provider: 'aws', category: 'Storage',  keywords: ['rds', 'database', 'mysql', 'postgres', 'aurora'], lucideBase: 'Database',  badge: 'RDS', tint: AWS_TINT },
  { id: 'aws:dynamodb',       label: 'DynamoDB',      provider: 'aws', category: 'Storage',  keywords: ['dynamodb', 'nosql', 'document db'],              lucideBase: 'Database',  badge: 'DDB', tint: AWS_TINT },
  { id: 'aws:elasticache',    label: 'ElastiCache',   provider: 'aws', category: 'Storage',  keywords: ['elasticache', 'redis', 'memcached', 'cache'],    lucideBase: 'MemoryStick', badge: 'EC', tint: AWS_TINT },
  { id: 'aws:ebs',            label: 'EBS',           provider: 'aws', category: 'Storage',  keywords: ['ebs', 'block storage', 'volume'],                lucideBase: 'HardDrive', badge: 'EBS', tint: AWS_TINT },
  { id: 'aws:efs',            label: 'EFS',           provider: 'aws', category: 'Storage',  keywords: ['efs', 'file system', 'nfs'],                     lucideBase: 'FolderOpen', badge: 'EFS', tint: AWS_TINT },

  // AWS Network
  { id: 'aws:vpc',            label: 'VPC',           provider: 'aws', category: 'Network',  keywords: ['vpc', 'virtual private cloud', 'network'],        lucideBase: 'Network',   badge: 'VPC', tint: AWS_TINT },
  { id: 'aws:subnet',         label: 'Subnet',        provider: 'aws', category: 'Network',  keywords: ['subnet', 'public', 'private'],                   lucideBase: 'Network',   badge: 'Sub', tint: AWS_TINT },
  { id: 'aws:alb',            label: 'ALB',           provider: 'aws', category: 'Network',  keywords: ['alb', 'load balancer', 'application'],            lucideBase: 'Router',    badge: 'ALB', tint: AWS_TINT },
  { id: 'aws:nlb',            label: 'NLB',           provider: 'aws', category: 'Network',  keywords: ['nlb', 'network load balancer'],                   lucideBase: 'Router',    badge: 'NLB', tint: AWS_TINT },
  { id: 'aws:cloudfront',     label: 'CloudFront',    provider: 'aws', category: 'Network',  keywords: ['cloudfront', 'cdn', 'edge'],                     lucideBase: 'Globe',     badge: 'CF',  tint: AWS_TINT },
  { id: 'aws:route53',        label: 'Route 53',      provider: 'aws', category: 'Network',  keywords: ['route53', 'dns', 'domain'],                      lucideBase: 'Globe',     badge: 'R53', tint: AWS_TINT },
  { id: 'aws:apigw',          label: 'API Gateway',   provider: 'aws', category: 'Network',  keywords: ['api gateway', 'rest', 'http'],                   lucideBase: 'Plug',      badge: 'API', tint: AWS_TINT },

  // AWS Security
  { id: 'aws:iam',            label: 'IAM',           provider: 'aws', category: 'Security', keywords: ['iam', 'identity', 'access', 'role', 'policy'],    lucideBase: 'ShieldCheck', badge: 'IAM', tint: AWS_TINT },
  { id: 'aws:cognito',        label: 'Cognito',       provider: 'aws', category: 'Security', keywords: ['cognito', 'auth', 'user pool'],                   lucideBase: 'Fingerprint', badge: 'Cog', tint: AWS_TINT },
  { id: 'aws:waf',            label: 'WAF',           provider: 'aws', category: 'Security', keywords: ['waf', 'firewall', 'web application'],              lucideBase: 'Shield',    badge: 'WAF', tint: AWS_TINT },
  { id: 'aws:kms',            label: 'KMS',           provider: 'aws', category: 'Security', keywords: ['kms', 'key management', 'encryption'],             lucideBase: 'Key',       badge: 'KMS', tint: AWS_TINT },
  { id: 'aws:secrets',        label: 'Secrets Manager', provider: 'aws', category: 'Security', keywords: ['secrets', 'secret manager'],                     lucideBase: 'Lock',      badge: 'SM',  tint: AWS_TINT },

  // AWS Messaging
  { id: 'aws:sqs',            label: 'SQS',           provider: 'aws', category: 'Messaging', keywords: ['sqs', 'queue', 'message'],                       lucideBase: 'Blocks',    badge: 'SQS', tint: AWS_TINT },
  { id: 'aws:sns',            label: 'SNS',           provider: 'aws', category: 'Messaging', keywords: ['sns', 'notification', 'pub/sub', 'topic'],        lucideBase: 'Bell',      badge: 'SNS', tint: AWS_TINT },
  { id: 'aws:ses',            label: 'SES',           provider: 'aws', category: 'Messaging', keywords: ['ses', 'email', 'smtp'],                           lucideBase: 'Mail',      badge: 'SES', tint: AWS_TINT },
  { id: 'aws:eventbridge',    label: 'EventBridge',   provider: 'aws', category: 'Messaging', keywords: ['eventbridge', 'event bus', 'events'],             lucideBase: 'Workflow',  badge: 'EB',  tint: AWS_TINT },
  { id: 'aws:kinesis',        label: 'Kinesis',       provider: 'aws', category: 'Messaging', keywords: ['kinesis', 'stream', 'real-time'],                 lucideBase: 'Workflow',  badge: 'KIN', tint: AWS_TINT },

  // AWS Integration
  { id: 'aws:stepfn',         label: 'Step Functions', provider: 'aws', category: 'Integration', keywords: ['step functions', 'workflow', 'state machine'], lucideBase: 'Workflow',  badge: 'SF',  tint: AWS_TINT },
  { id: 'aws:cloudwatch',     label: 'CloudWatch',    provider: 'aws', category: 'Integration', keywords: ['cloudwatch', 'monitoring', 'logs', 'metrics'], lucideBase: 'BarChart3', badge: 'CW',  tint: AWS_TINT },
  { id: 'aws:codepipeline',   label: 'CodePipeline',  provider: 'aws', category: 'Integration', keywords: ['codepipeline', 'ci/cd', 'deploy'],            lucideBase: 'GitBranch', badge: 'CP',  tint: AWS_TINT },

  // ═══════════════════════════════════════════
  // AZURE
  // ═══════════════════════════════════════════

  // Azure Compute
  { id: 'azure:vm',           label: 'Virtual Machine', provider: 'azure', category: 'Compute', keywords: ['vm', 'virtual machine', 'server'],             lucideBase: 'Server',    badge: 'VM',  tint: AZURE_TINT },
  { id: 'azure:appservice',   label: 'App Service',    provider: 'azure', category: 'Compute', keywords: ['app service', 'web app', 'paas'],               lucideBase: 'Server',    badge: 'App', tint: AZURE_TINT },
  { id: 'azure:functions',    label: 'Functions',      provider: 'azure', category: 'Compute', keywords: ['functions', 'serverless', 'azure function'],     lucideBase: 'Zap',       badge: 'Fn',  tint: AZURE_TINT },
  { id: 'azure:aks',          label: 'AKS',            provider: 'azure', category: 'Compute', keywords: ['aks', 'kubernetes', 'k8s', 'container'],         lucideBase: 'Container', badge: 'AKS', tint: AZURE_TINT },
  { id: 'azure:aci',          label: 'Container Instances', provider: 'azure', category: 'Compute', keywords: ['aci', 'container instances'],              lucideBase: 'Container', badge: 'ACI', tint: AZURE_TINT },
  { id: 'azure:batch',        label: 'Batch',          provider: 'azure', category: 'Compute', keywords: ['batch', 'hpc', 'compute'],                      lucideBase: 'Cpu',       badge: 'Bat', tint: AZURE_TINT },

  // Azure Storage
  { id: 'azure:storage',      label: 'Storage Account', provider: 'azure', category: 'Storage', keywords: ['storage account', 'blob', 'files', 'queue'],   lucideBase: 'FolderOpen', badge: 'SA', tint: AZURE_TINT },
  { id: 'azure:sqldb',        label: 'SQL Database',   provider: 'azure', category: 'Storage', keywords: ['sql', 'database', 'azure sql'],                  lucideBase: 'Database',  badge: 'SQL', tint: AZURE_TINT },
  { id: 'azure:cosmosdb',     label: 'Cosmos DB',      provider: 'azure', category: 'Storage', keywords: ['cosmos', 'nosql', 'document', 'global'],         lucideBase: 'Database',  badge: 'Cos', tint: AZURE_TINT },
  { id: 'azure:redis',        label: 'Redis Cache',    provider: 'azure', category: 'Storage', keywords: ['redis', 'cache', 'azure cache'],                 lucideBase: 'MemoryStick', badge: 'Red', tint: AZURE_TINT },
  { id: 'azure:postgresql',   label: 'PostgreSQL',     provider: 'azure', category: 'Storage', keywords: ['postgresql', 'postgres', 'flexible server'],     lucideBase: 'Database',  badge: 'PG',  tint: AZURE_TINT },

  // Azure Network
  { id: 'azure:vnet',         label: 'VNet',           provider: 'azure', category: 'Network', keywords: ['vnet', 'virtual network'],                       lucideBase: 'Network',   badge: 'VN',  tint: AZURE_TINT },
  { id: 'azure:subnet',       label: 'Subnet',         provider: 'azure', category: 'Network', keywords: ['subnet'],                                        lucideBase: 'Network',   badge: 'Sub', tint: AZURE_TINT },
  { id: 'azure:appgw',        label: 'App Gateway',    provider: 'azure', category: 'Network', keywords: ['application gateway', 'load balancer', 'waf'],   lucideBase: 'Router',    badge: 'AG',  tint: AZURE_TINT },
  { id: 'azure:lb',           label: 'Load Balancer',  provider: 'azure', category: 'Network', keywords: ['load balancer', 'azure lb'],                     lucideBase: 'Router',    badge: 'LB',  tint: AZURE_TINT },
  { id: 'azure:frontdoor',    label: 'Front Door',     provider: 'azure', category: 'Network', keywords: ['front door', 'cdn', 'edge', 'global'],           lucideBase: 'Globe',     badge: 'FD',  tint: AZURE_TINT },
  { id: 'azure:dns',          label: 'DNS Zone',       provider: 'azure', category: 'Network', keywords: ['dns', 'zone', 'domain'],                         lucideBase: 'Globe',     badge: 'DNS', tint: AZURE_TINT },
  { id: 'azure:apim',         label: 'API Management', provider: 'azure', category: 'Network', keywords: ['apim', 'api management', 'gateway'],             lucideBase: 'Plug',      badge: 'API', tint: AZURE_TINT },

  // Azure Security
  { id: 'azure:keyvault',     label: 'Key Vault',      provider: 'azure', category: 'Security', keywords: ['key vault', 'secrets', 'keys', 'certificates'], lucideBase: 'Key',       badge: 'KV',  tint: AZURE_TINT },
  { id: 'azure:aad',          label: 'Entra ID',       provider: 'azure', category: 'Security', keywords: ['entra', 'aad', 'active directory', 'identity'], lucideBase: 'ShieldCheck', badge: 'ID', tint: AZURE_TINT },
  { id: 'azure:firewall',     label: 'Firewall',       provider: 'azure', category: 'Security', keywords: ['firewall', 'network security'],                 lucideBase: 'Shield',    badge: 'FW',  tint: AZURE_TINT },
  { id: 'azure:nsg',          label: 'NSG',            provider: 'azure', category: 'Security', keywords: ['nsg', 'network security group'],                 lucideBase: 'Shield',    badge: 'NSG', tint: AZURE_TINT },

  // Azure Messaging
  { id: 'azure:servicebus',   label: 'Service Bus',    provider: 'azure', category: 'Messaging', keywords: ['service bus', 'queue', 'topic', 'messaging'],  lucideBase: 'Blocks',    badge: 'SB',  tint: AZURE_TINT },
  { id: 'azure:eventhub',     label: 'Event Hubs',     provider: 'azure', category: 'Messaging', keywords: ['event hubs', 'streaming', 'kafka'],            lucideBase: 'Workflow',  badge: 'EH',  tint: AZURE_TINT },
  { id: 'azure:eventgrid',    label: 'Event Grid',     provider: 'azure', category: 'Messaging', keywords: ['event grid', 'events', 'pub/sub'],             lucideBase: 'Workflow',  badge: 'EG',  tint: AZURE_TINT },

  // Azure Integration
  { id: 'azure:monitor',      label: 'Monitor',        provider: 'azure', category: 'Integration', keywords: ['monitor', 'log analytics', 'insights'],      lucideBase: 'BarChart3', badge: 'Mon', tint: AZURE_TINT },
  { id: 'azure:loganalytics', label: 'Log Analytics',  provider: 'azure', category: 'Integration', keywords: ['log analytics', 'logs', 'kusto'],            lucideBase: 'FileText',  badge: 'LA',  tint: AZURE_TINT },
  { id: 'azure:devops',       label: 'DevOps',         provider: 'azure', category: 'Integration', keywords: ['devops', 'pipelines', 'ci/cd'],              lucideBase: 'GitBranch', badge: 'DO',  tint: AZURE_TINT },
]

// Lookup by icon ID for O(1) access
export const ICON_REGISTRY_MAP = new Map(ICON_REGISTRY.map(i => [i.id, i]))
