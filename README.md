# 🚀 Universal Backend Generator

An AI-powered CLI tool that generates a **complete Express.js backend** from any file or URL — powered by **Groq** or **OpenRouter**.

---

## ✨ Features

- 📂 **File Input** — Feed it a `.json`, `.csv`, `.sql`, `.yaml`, or `.txt` file
- 🌐 **URL Input** — Point it at any website or API endpoint
- 🤖 **AI-Powered** — Uses Groq (fast!) or OpenRouter (flexible!) to generate code
- ⚡ **Auto-Fallback** — If primary AI provider fails, it switches to the backup automatically
- 📁 **Full Backend Output** — Routes, controllers, middleware, error handling, README, and more

---

## 📦 Installation

```bash
git clone <your-repo>
cd universal-backend
npm install
```

---

## ⚙️ Setup

Copy the example env file and add your API keys:

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Get free key at https://console.groq.com
GROQ_API_KEY=your_groq_api_key_here

# Get key at https://openrouter.ai (optional, used as fallback)
OPENROUTER_API_KEY=your_openrouter_key_here

# Primary provider: groq or openrouter
AI_PROVIDER=groq
```

---

## 🚀 Usage

### Generate from a JSON file
```bash
node src/index.js --file ./data.json
```

### Generate from a CSV file
```bash
node src/index.js --file ./products.csv
```

### Generate from a SQL schema
```bash
node src/index.js --file ./schema.sql
```

### Generate from a URL
```bash
node src/index.js --url https://jsonplaceholder.typicode.com
```

### Custom output directory
```bash
node src/index.js --file ./data.json --output ./my-api
```

### Use OpenRouter instead of Groq
```bash
node src/index.js --file ./data.json --provider openrouter
```

---

## 📁 What Gets Generated

```
generated-backend/
├── index.js                  ← Express app entry point
├── routes/
│   └── *.js                  ← RESTful routes per resource
├── controllers/
│   └── *.js                  ← Business logic
├── middleware/
│   ├── errorHandler.js       ← Global error handler
│   └── validate.js           ← Request validation
├── .env.example
├── package.json
└── README.md
```

---

## 🛠️ Supported Input File Types

| Extension | Description |
|-----------|-------------|
| `.json` | JSON data or schema |
| `.csv` | Comma-separated data |
| `.sql` | SQL schema / CREATE TABLE statements |
| `.yaml` / `.yml` | OpenAPI specs or config files |
| `.txt` / `.md` | Plain text descriptions |

---

## 🔑 API Keys

| Provider | Free Tier | Speed | Models |
|----------|-----------|-------|--------|
| [Groq](https://console.groq.com) | ✅ Yes | ⚡ Very Fast | Llama 3.1 70B, Mixtral |
| [OpenRouter](https://openrouter.ai) | ✅ Yes (some models) | 🔄 Varies | GPT-4o, Claude, Llama, Gemini |

---

## 📝 CLI Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--file <path>` | `-f` | Input file path | — |
| `--url <url>` | `-u` | Input URL | — |
| `--output <dir>` | `-o` | Output directory | `./generated-backend` |
| `--provider <name>` | `-p` | AI provider: groq or openrouter | `groq` |

---

## 💡 Tips

- **Groq is free and blazing fast** — great for development
- For very large files, the tool automatically truncates content to fit AI context windows
- The generated backend uses **in-memory arrays** as data store by default — easy to swap with a real DB later
- Run the generated backend with: `cd generated-backend && npm install && node index.js`

---

## 🗺️ Roadmap

- [ ] Database support (Prisma / Mongoose auto-generation)
- [ ] Authentication boilerplate (JWT)
- [ ] Docker file generation
- [ ] Live mode (spin up server immediately without writing files)
- [ ] Multiple framework support (Fastify, Hono, Koa)

---

## 📄 License

MIT
