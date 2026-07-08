// Supabase Edge Function — Diagnóstico personalizado do Quiz Coleção Beauty
// Runtime: Deno. O token do Claude fica em Deno.env.get("ANTHROPIC_API_KEY")
// (secret do Supabase — NUNCA no código).
//
// Deploy:
//   supabase functions deploy diagnostico --project-ref knqfiqyvpglyfabsmmlm
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref knqfiqyvpglyfabsmmlm

const MODEL = "claude-opus-4-8"; // melhor qualidade (mais lento, sem problema pro funil)

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
- "titulo": UMA frase curta, clara e de fácil leitura, que resume o problema dela de um jeito
  que ela pensa "é isso mesmo". Português natural, sem trocadilho, sem duplo sentido, sem cortar
  no meio. Tem que fazer sentido sozinha, lida rápido. Máx 8 palavras. Sem ponto final.
  Exemplos do TOM (não copie, personalize à resposta dela):
    "Você tem talento, mas seus materiais não vendem"
    "Seu trabalho vale mais do que você cobra"
    "Você está perdendo cliente na apresentação"
    "Seu tráfego chega, mas não vira cliente"
    "Falta pouco pra você cobrar o que merece"
- "texto": 4 a 6 frases (um diagnóstico bem desenvolvido, não curto) em português SIMPLES e
  CORRETO (zero erro de gramática ou concordância), fáceis de entender lendo rápido. O objetivo
  é que ela reconheça que TEM UM PROBLEMA REAL hoje que está travando as vendas dela. Desenvolva:
  (1) reconheça o valor dela (área e tempo de atuação), (2) mostre o problema real na forma como
  ela divulga hoje, (3) conecte com o que ela marcou que trava, (4) mostre a consequência disso
  (perder cliente, cobrar barato, não fechar combo), (5) termine deixando claro que isso tem
  solução. Cite de forma explícita o que ela respondeu para a fala fazer TOTAL sentido com a
  situação dela. Escreva como quem conversa: frases curtas, sem enrolação, sem palavra difícil,
  sem metáfora confusa. Cada frase precisa fazer sentido sozinha.
- "pontos": exatamente 3 itens curtos e específicos (máx ~12 palavras cada), claros. O último
  SEMPRE conecta à Coleção Beauty como a solução.
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

    // effort "low" acelera a geração numa tarefa simples de copy.
    // (Fast Mode do Opus está desabilitado nesta conta, por isso não é usado.)
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
