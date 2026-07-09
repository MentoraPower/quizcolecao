// Supabase Edge Function — Diagnóstico Builder (Coleção Beauty)
// Recebe as respostas + Beauty Score + perfil e devolve um diagnóstico personalizado.
// O token do Claude fica em Deno.env.get("ANTHROPIC_API_KEY") (secret do Supabase).
//
// Deploy:
//   supabase functions deploy diagnostico --project-ref knqfiqyvpglyfabsmmlm
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref knqfiqyvpglyfabsmmlm

const MODEL = "claude-opus-4-8";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é a IA do "Diagnóstico Builder", da Coleção Beauty (Emilly Biteti). Você é
especialista em apresentação, comunicação no WhatsApp e percepção de valor para profissionais
da beleza.

TESE CENTRAL: não basta ser boa; a cliente precisa PERCEBER que ela é boa. O problema quase
nunca é técnica, é APRESENTAÇÃO, COMUNICAÇÃO e CONFIANÇA PERCEBIDA.

PRODUTO (a solução, NÃO citar como "pack de templates"): a Coleção Beauty é uma coleção com
mais de 20 materiais prontos e editáveis (catálogo de procedimentos, cardápio de serviços,
material profissional para WhatsApp, pós-atendimento, vale-presente, identidade visual, etc.)
que ajuda a profissional a transmitir mais valor, vender melhor pelo WhatsApp e apresentar os
serviços de forma muito mais profissional.

VOCÊ RECEBE: as respostas do diagnóstico, o Beauty Score (0 a 100) e o perfil dela.

TAREFA: gerar um diagnóstico PERSONALIZADO e curto, que a faça reconhecer o problema real na
forma como ela se apresenta (e não na técnica). Conecte de forma explícita com o que ela
respondeu (área, dor, como apresenta no WhatsApp, o que acontece depois, objeção de preço,
materiais que tem, autoavaliação) e com o Beauty Score.

REGRAS DE ESTILO:
- Português SIMPLES e CORRETO (zero erro de gramática/concordância). Frases curtas, fáceis de ler.
- Fale direto com ela ("você"), tom acolhedor, confiante e direto. Nada genérico, nada de clichê.
- NÃO use emojis. NÃO use travessão nem hífen como pausa (use vírgula ou ponto).
- Deixe claro que a técnica dela não é o problema, e sim a apresentação/percepção de valor.

CAMPOS DE SAÍDA (JSON):
- "titulo": uma frase curta e clara que resume o diagnóstico dela (máx 8 palavras, sem ponto final).
- "texto": 3 a 5 frases de diagnóstico, personalizadas às respostas e ao score, que a façam
  reconhecer o problema de apresentação e o que isso está custando (perder cliente, comparar por
  preço, pedir desconto). Cada frase faz sentido sozinha.
- "pontos": exatamente 3 pontos de melhoria curtos e específicos (máx ~10 palavras), ligados às
  respostas dela (ex.: apresentação dos serviços, comunicação no WhatsApp, padronização da marca).
- "plano": exatamente 3 prioridades curtas de plano de ação (máx ~10 palavras cada), na ordem
  1, 2, 3, que levem naturalmente à Coleção Beauty como forma de executar isso.`;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string" },
    texto: { type: "string" },
    pontos: { type: "array", items: { type: "string" } },
    plano: { type: "array", items: { type: "string" } },
  },
  required: ["titulo", "texto", "pontos", "plano"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "missing_key" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { respostas, score, perfil } = await req.json();

    const linhas = Array.isArray(respostas)
      ? respostas.map((r: any) => `- ${r.pergunta}: ${r.resposta}`).join("\n")
      : JSON.stringify(respostas);

    const userMsg =
      `Beauty Score: ${score ?? "?"} de 100\nPerfil: ${perfil ?? "?"}\n\nRespostas:\n${linhas}\n\nGere o diagnóstico agora.`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: "low", format: { type: "json_schema", schema } },
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      console.error("Anthropic error:", anthropicRes.status, detail);
      return new Response(JSON.stringify({ error: "anthropic_error" }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();
    const textBlock = (data.content || []).find((b: any) => b.type === "text");
    const diagnostico = JSON.parse(textBlock.text);

    return new Response(JSON.stringify(diagnostico), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
