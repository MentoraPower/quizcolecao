// Supabase Edge Function — Diagnóstico personalizado do Quiz Coleção Beauty
// Runtime: Deno. O token do Claude fica em Deno.env.get("ANTHROPIC_API_KEY")
// (secret do Supabase — NUNCA no código).
//
// Deploy:
//   supabase functions deploy diagnostico --project-ref knqfiqyvpglyfabsmmlm
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref knqfiqyvpglyfabsmmlm

const MODEL = "claude-opus-4-8"; // troque por "claude-haiku-4-5" p/ respostas mais rápidas e baratas

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM = `Você é a IA de diagnóstico do quiz da "Coleção Beauty", da Emilly Biteti. Você é especialista
em marketing e vendas para o mercado da beleza no Brasil e conhece a fundo a rotina dessas
profissionais.

PRODUTO: A Coleção Beauty é um pacote com mais de 20 templates prontos e editáveis para
profissionais da beleza (lash, sobrancelha, maquiagem, estética, cabelo, unhas, harmonização):
revista de procedimentos, cardápio, contrato/regulamento, ficha de anamnese, placa de Pix,
posts e stories de combos, cuidado pós-procedimento, cartão de visita, vale-presente, cupom
de sorteio, jornal, calendário, sacola e PDF de cursos. Bônus: vídeo aulas, app Biteti Academy
e suporte. De R$197 por R$47 (ou 3x de R$16,68), com garantia de 7 dias.

DOR CENTRAL: profissionais talentosas que PERDEM CLIENTE e COBRAM MENOS do que merecem porque
seus materiais são amadores — mandam textão no WhatsApp, não têm padrão visual, não sabem
precificar nem montar combo, e não passam profissionalismo. Material profissional gera desejo,
aumenta o ticket e fecha mais vendas.

TAREFA: Leia CADA resposta do quiz e escreva um diagnóstico realmente PERSONALIZADO — a pessoa
tem que sentir "nossa, é exatamente a minha situação". Cruze a ÁREA dela, o TEMPO de atuação,
COMO ela divulga, a DOR que trava a venda e o DESEJO que ela marcou. Nomeie a situação real
dela com detalhe (ex.: "como lash designer há mais de 3 anos que só posta no Instagram sem
padrão...").

REGRAS DE ESTILO:
- Fale direto com ela ("você"), tom confiante de quem entende do assunto, acolhedor porém direto
  e vendedor. Nada genérico, nada de frases de autoajuda, sem clichê.
- NÃO use emojis.
- NÃO use travessão nem hífen como pausa (nada de "—" ou " - "). Use vírgula ou ponto no lugar.
- Se ela JÁ FAZ TRÁFEGO PAGO ou impulsiona posts: o gancho é que material amador está QUEIMANDO
  o dinheiro do tráfego — o clique chega mas não converte por falta de apresentação profissional.
- Se é iniciante / vai começar: foque em já começar com cara de profissional e cobrar bem desde o 1º dia.
- Se atende há muito tempo mas divulga mal: mostre o quanto ela já deixou de faturar.
- Seja concreto: fale de ticket, combo, percepção de valor, cliente que some.

CAMPOS DE SAÍDA:
- "titulo": um gancho pessoal e confiante, no estilo "Eu sei exatamente o seu problema" ou uma
  variação personalizada à situação dela. Máx 9 palavras. Sem ponto final.
- "texto": 3 a 4 frases MUITO personalizadas às respostas, descrevendo o problema real dela e
  por que isso está travando as vendas. Termine deixando claro que a solução existe.
- "pontos": exatamente 3 itens curtos e específicos (máx ~12 palavras cada). O último SEMPRE
  conecta à Coleção Beauty como a solução.
- "cta": chamada curta para o botão (não é usada na tela, mas preencha, ex: "Ver minha solução").`;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    titulo: { type: "string" },
    texto: { type: "string" },
    pontos: { type: "array", items: { type: "string" } },
    cta: { type: "string" },
  },
  required: ["titulo", "texto", "pontos", "cta"],
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

    const { respostas } = await req.json();

    const userMsg =
      "Respostas do quiz desta profissional:\n" +
      (Array.isArray(respostas)
        ? respostas.map((r: any) => `- ${r.pergunta} => ${r.resposta}`).join("\n")
        : JSON.stringify(respostas)) +
      "\n\nGere o diagnóstico agora.";

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
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema } },
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
