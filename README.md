# Busca Sem Filtro

[![CI](https://github.com/darksemfiltro/Buscador-Sem-Filtro/actions/workflows/ci.yml/badge.svg)](https://github.com/darksemfiltro/Buscador-Sem-Filtro/actions/workflows/ci.yml)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-22d3b4.svg)](LICENSE)

Analytics e engenharia reversa para canais dark e faceless no YouTube. O aplicativo consulta dados reais da YouTube Data API v3 e usa IA, de forma opcional, para gerar análises de mercado, conteúdo e SEO.

O projeto roda inteiramente no navegador, sem backend e sem etapa de build.

[Tutorial em vídeo](https://youtu.be/PJHSW_xPsLA) · [Canal Dark Sem Filtro](https://www.youtube.com/@DarkSemFiltro) · [Comunidade no Discord](https://discord.gg/va64qDkEZR)

## Recursos

| Área | O que oferece |
| --- | --- |
| Pesquisa avançada | Busca por palavra-chave, filtros de formato, duração, data, país, idioma e tamanho do canal; geração de palavras-chave com IA; exportação em PDF. |
| Em alta | Rankings por país e categoria, filtros para Shorts e vídeos longos, ordenação por desempenho e leitura de oportunidades com IA. |
| Canais | Consulta por `@handle`, URL ou ID, métricas do canal, histórico de vídeos e dossiê estratégico gerado por IA. |
| Vídeos | Métricas, tags, descrição, duração, download da thumbnail e análise de conteúdo com IA. |
| Comparação | Dois canais lado a lado, com indicadores de alcance, frequência, engajamento e relatório comparativo. |
| Favoritos e exportação | Canais e vídeos salvos no navegador, exportáveis em TXT ou PDF. |

As consultas de dados funcionam sem IA. Os relatórios, diagnósticos e sugestões gerados dependem de um dos provedores configurados.

## Início rápido

### Requisitos

- Navegador moderno com Web Crypto API e `localStorage`.
- Chave da YouTube Data API v3.
- Python, Node.js ou outro servidor HTTP local.

### Instalação

```bash
git clone https://github.com/darksemfiltro/Buscador-Sem-Filtro.git
cd Buscador-Sem-Filtro
python -m http.server 8080
```

Abra [http://localhost:8080](http://localhost:8080). Se preferir Node.js, execute `npx serve .` e use o endereço exibido no terminal.

Use um servidor HTTP. A abertura direta do `index.html` pelo protocolo `file://` pode bloquear requisições externas.

## Configuração das APIs

### YouTube Data API v3

A chave do YouTube é obrigatória para buscas e análises:

1. Abra a [YouTube Data API v3 no Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com).
2. Selecione ou crie um projeto e ative a API.
3. Crie uma chave em **APIs e serviços > Credenciais**.
4. Restrinja a chave à YouTube Data API v3 e aos referenciadores HTTP que executarão o aplicativo.
5. Cole a chave no campo **YouTube API Key** da interface.

O Google aplica cotas por projeto. Buscas, detalhes e rankings consomem valores diferentes; acompanhe o uso no Google Cloud Console.

### Provedor de IA

A IA é opcional. Escolha um provedor na interface:

| Provedor | Credencial | Observação |
| --- | --- | --- |
| [Gemini](https://aistudio.google.com/app/apikey) | Chave obrigatória | O aplicativo lista modelos Flash e Gemma compatíveis com `generateContent`. |
| [OpenRouter](https://openrouter.ai/keys) | Chave obrigatória | Apenas modelos com o sufixo `:free` aparecem na lista. |
| [Hugging Face](https://huggingface.co/settings/tokens) | Token obrigatório | O token precisa permitir chamadas aos Inference Providers. |
| [LLM7.io](https://llm7.io) | Token opcional | Pode funcionar de forma anônima; o token libera os limites associados à conta. |

Quando possível, a lista de modelos é consultada no provedor e mantida em cache por 24 horas. Se a consulta falhar, o aplicativo usa uma lista local de fallback. O botão de atualização força uma nova consulta.

### Primeiro acesso

1. Informe a chave do YouTube.
2. Se quiser usar IA, selecione um provedor, informe a credencial quando exigida e escolha um modelo.
3. Clique em **Salvar Chaves**.
4. Crie a senha mestra solicitada pelo cofre.
5. Use o botão **✓** (**Testar Conexões**) para validar a configuração.

Não existem arquivos `.env` neste fluxo. As credenciais são configuradas somente pela interface.

## Segurança e privacidade

- O projeto não possui servidor próprio. O navegador envia cada chave apenas à API correspondente.
- O cofre cifra as credenciais com AES-GCM de 256 bits. A chave criptográfica é derivada da senha mestra com PBKDF2-SHA-256 e 210.000 iterações.
- O `localStorage` guarda somente o conteúdo cifrado do cofre. A chave derivada e os dados descriptografados ficam em memória enquanto o cofre está aberto.
- O cofre bloqueia após 15 minutos, limpa os campos de credenciais e exige a senha mestra novamente.
- A senha mestra não possui recuperação. Limpar os dados do site remove o cofre e os dados locais.
- Favoritos, preferências, cache de modelos e contadores permanecem no perfil do navegador; não há sincronização entre dispositivos.

Antes de publicar sua própria instância, revise os scripts externos carregados por `index.html` e aplique restrições de origem e API às credenciais.

## Estrutura do projeto

```text
Buscador-Sem-Filtro/
├── .github/workflows/ci.yml  # Pipeline de integração contínua
├── css/style.css             # Layout responsivo e tema visual
├── docs/SQLITE-FUTURO.md     # Proposta de persistência futura
├── img/bg.png                # Imagem usada pela interface
├── js/
│   ├── ai.js                 # Prompts e chamadas aos provedores de IA
│   ├── api.js                # Integração com a YouTube Data API v3
│   ├── app.js                # Interface, navegação e casos de uso
│   ├── models.js             # Descoberta, filtro e cache de modelos
│   ├── pdf.js                # Relatórios em PDF
│   ├── utils.js              # Provedores, armazenamento e utilitários
│   └── vault.js              # Cofre de credenciais com Web Crypto
├── scripts/check-js-syntax.cjs
├── tests/                    # Testes com o runner nativo do Node.js
├── index.html                # Ponto de entrada do aplicativo
├── package.json              # Comandos de validação
└── LICENSE                   # Licença MIT
```

Os arquivos seguem JavaScript puro, HTML e CSS. As dependências usadas pela interface são carregadas pelo navegador.

## Desenvolvimento e testes

Use Node.js 20 ou superior:

```bash
npm ci
npm run check
```

Comandos disponíveis:

| Comando | Validação |
| --- | --- |
| `npm run check:syntax` | Verifica a sintaxe dos arquivos JavaScript. |
| `npm test` | Executa testes unitários e de integração com `node:test`. |
| `npm run check` | Executa as duas etapas anteriores. |

O workflow [CI](.github/workflows/ci.yml) executa `npm run check` em todo push e pull request.

## Limitações conhecidas

- A cota da YouTube Data API pode impedir novas consultas até a renovação do período de uso.
- Modelos, preços e limites pertencem aos provedores e podem mudar sem atualização do projeto.
- Extensões, bloqueadores, políticas de rede e CORS podem impedir chamadas diretas feitas pelo navegador.
- O armazenamento é local ao perfil do navegador. Não há login, backup automático ou sincronização.
- As análises de IA podem conter erros e devem ser conferidas antes de orientar decisões de conteúdo.

## Como contribuir

1. Faça um fork do repositório.
2. Crie uma branch para a mudança.
3. Execute `npm run check`.
4. Envie um pull request com o problema resolvido e a forma de validação.

Relatos de falha devem informar o navegador, a operação executada e a mensagem exibida, sem incluir chaves de API.

## Licença

Distribuído sob a [licença MIT](LICENSE).
