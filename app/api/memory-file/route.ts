import { createMemoryFile, MAX_MEMORY_FILE_BYTES, readMemoryFile, saveMemoryFile } from "@/lib/memory-files";

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return errorResponse("Missing memory file id", 400);
  const memory = await readMemoryFile(id);
  return memory ? Response.json(memory) : errorResponse("Memory file not found", 404);
}

export async function PUT(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Invalid JSON body", 400); }
  if (!body || typeof body !== "object") return errorResponse("Invalid request body", 400);
  const { id, content } = body as { id?: unknown; content?: unknown };
  if (typeof id !== "string" || typeof content !== "string") return errorResponse("id and content are required", 400);
  if (Buffer.byteLength(content, "utf8") > MAX_MEMORY_FILE_BYTES) return errorResponse("Markdown file is too large", 413);
  try {
    return Response.json(await saveMemoryFile(id, content));
  } catch (error) {
    if ((error as Error).message === "INVALID_MEMORY_ID") return errorResponse("Invalid memory file id", 400);
    throw error;
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("Invalid JSON body", 400); }
  if (!body || typeof body !== "object") return errorResponse("Invalid request body", 400);
  const { domain, title } = body as { domain?: unknown; title?: unknown };
  if (typeof domain !== "string" || typeof title !== "string") return errorResponse("domain and title are required", 400);
  try {
    return Response.json(await createMemoryFile(domain, title), { status: 201 });
  } catch (error) {
    const code = (error as Error).message;
    if (code === "INVALID_MEMORY_DOMAIN" || code === "INVALID_MEMORY_TITLE") return errorResponse("Invalid domain or title", 400);
    throw error;
  }
}
