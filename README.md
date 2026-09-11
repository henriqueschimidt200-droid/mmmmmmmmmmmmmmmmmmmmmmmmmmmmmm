# Mental AI — versão gratuita com OpenRouter

Projeto Express pronto para hospedar no Render Free. A IA usa o roteador gratuito `openrouter/free`, quando disponível.

## Deploy
1. Suba esta pasta para um repositório GitHub privado ou público.
2. No Render: New → Web Service → conecte o repositório.
3. Build: `npm install`
4. Start: `npm start`
5. Plano: Free
6. Em Environment, crie `OPENROUTER_API_KEY` com sua chave do OpenRouter.
7. `OPENROUTER_MODEL=openrouter/free`.

Nunca coloque a chave no HTML, GitHub ou envie a chave por mensagem.

Observação: o plano gratuito do Render usa armazenamento efêmero. Contas SQLite podem ser perdidas quando o serviço reinicia. Para um projeto de teste/hobby, isso é aceitável; para produção, use um banco persistente.
