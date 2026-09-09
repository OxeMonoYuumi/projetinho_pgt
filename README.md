# Nexo

Chatbot em HTML, CSS e JavaScript com histórico no Supabase, modelo `gpt-oss` via Groq e deploy no Cloudflare Pages Functions.

## Configuração

1. Crie um projeto no Supabase e execute [`schema.sql`](schema.sql) no SQL Editor.
2. No Cloudflare Pages, conecte este repositório e use a raiz como diretório de build. Não é necessário comando de build.
3. Em **Settings > Variables and Secrets**, adicione:
   - `SUPABASE_URL`: URL do projeto Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave service role do Supabase. Mantenha como secret.
   - `GROQ_API_KEY`: chave da API Groq. Mantenha como secret.
   - `GROQ_MODEL`: opcional; padrão `openai/gpt-oss-20b`.
4. Faça um novo deploy.

As credenciais ficam somente nas Pages Functions. O navegador envia apenas um identificador anônimo persistido em `localStorage`; a chave service role nunca chega ao cliente.

## Desenvolvimento local

Com Wrangler instalado, rode `npx wrangler pages dev .`. Para testar as Functions localmente, crie um arquivo `.dev.vars` com as mesmas variáveis secretas.
