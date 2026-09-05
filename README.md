# 🔍 Busca Sem Filtro — YouTube Analytics Pro

**Analisador profissional de YouTube para criadores de conteúdo dark/faceless.** Dados reais da API do YouTube + análises de IA para descobrir o que funciona, quem está crescendo e como replicar.

> ⚠️ **Aviso:** Este é um projeto **open source**. Proteja suas chaves de API — nunca compartilhe suas chaves em públicos.

---

## 🚀 Como Começar

### 1. Clone ou baixe o projeto

```bash
git clone https://github.com/darksemfiltro/buscador-sem-filtro.git
cd buscador-sem-filtro
```

### 2. Abra no navegador

A forma mais simples é abrir o `index.html` diretamente no navegador.

**Para funcionalidades completas (especialmente Ollama local):**

```bash
# Instale o Node.js (https://nodejs.org), depois:
npx serve .
```

Acesse `http://localhost:3000`

### 3. Configure suas chaves de API

Clique no ícone ⚙️ no canto superior direito e preencha:

| Chave | Como obter |
|---|---|
| **YouTube Data API v3** | [Google Cloud Console](https://console.cloud.google.com) → APIs → YouTube Data API v3 |
| **LLM7.io** (recomendado) | [LLM7.io](https://llm7.io) — gratuito com limite generoso |
| **OpenRouter** | [OpenRouter.ai](https://openrouter.ai) — diversos modelos |
| **Gemini (Google AI)** | [Google AI Studio](https://aistudio.google.com) |

> 📖 Guia completo para Ollama: leia o arquivo [GUIA_OLLAMA.md](GUIA_OLLAMA.md).

---

## 🎯 Funcionalidades

### Pesquisa Avançada
Busque vídeos por palavra-chave com filtros poderosos:
- **Formato:** Todos / Longos (>1min) / Shorts
- **Duração:** <5min / 5-15min / 15-60min / >60min
- **Inscritos do canal:** Até 1K, 1-10K, 10-100K, 100K-1M+
- **Views totais do canal:** Filtro por tamanho do canal
- **Data de publicação:** Última semana, mês, ano
- **País/Região:** Simula trending de qualquer país
- **Idioma:** relevanceLanguage para refinar resultados
- Gerador de palavras-chave com IA
- Exportação em PDF dos resultados

### 📊 Em Alta (Trending)
- Rankings de vídeos em alta por país e categoria
- Filtros por formato (Shorts / Longos)
- Ordenação por views, engajamento, data
- Análise de IA com oportunidades faceless

### ⚔️ Comparar Concorrentes
Compare dois canais lado a lado com métricas avançadas:
- Inscritos, views totais, vídeos publicados
- Views/video, inscritos/video
- Engajamento médio, % de Shorts
- Vendas/semana estimadas
- Geração de relatório comparativo com IA

### 📺 Análise de Canal
Busque qualquer canal por @handle, URL ou ID:
- Estatísticas completas (subs, views, vídeos)
- Banner e avatar do canal
- Engajamento médio, taxa sub/view
- Dossiê gerado por IA com estratégia de posicionamento

### 🎬 Análise de Vídeo
Informe a URL de qualquer vídeo:
- Views, likes, comentários, engajamento
- Tags, descrição, duração
- Download da thumbnail em máxima qualidade
- Engenharia reversa do conteúdo com IA

### 📅 Histórico do Canal
Veja todos os vídeos de um canal com filtros:
- Por formato (Shorts / Longos)
- Por período
- Ordenação por views, likes, engajamento

### ⭐ Favoritos
Salve canais e vídeos favoritos para consulta posterior:
- Organização separada (Canais vs Vídeos)
- Exportação em TXT e PDF

### 🧠 Gerador de Palavras-Chave com IA
Receba ideias de palavras-chave automaticamente:
- 6 nichos pré-configurados (História, Música, Estoicismo, etc.)
- Geração com IA personalizada por idioma e país-alvo
- 20+ idiomas e mercados disponíveis

---

## 📋 Pré-requisitos de API

### YouTube Data API v3 (obrigatório)

1. Acesse [Google Cloud Console](https://console.cloud.google.com)
2. Crie um projeto → APIs e Serviços → Biblioteca
3. Busque "YouTube Data API v3" → Ativar
4. Credenciais → Criar Credenciais → Chave de API
5. **Importante:** Restrinja a chave por domínio/IP para segurança

**Cotas gratuitas:**
- 10.000 unidades/dia (busca)
- 1.000 unidades/dia (listagem de trending)
- Cada busca de canal custa **1 unidade**
- Cada trending custa **~100 unidades**

### Chave de IA (opcional, mas recomendado)

Sem ela você consegue usar todas as ferramentas de dados, mas não os relatórios gerados por IA.

| Provedor | Custo | Link |
|---|---|---|
| **LLM7.io** (recomendado) | Gratuito com limite | [llm7.io](https://llm7.io) |
| OpenRouter | Pay-per-use | [openrouter.ai](https://openrouter.ai) |
| Gemini (Google AI) | Gratuito com limite | [aistudio.google.com](https://aistudio.google.com) |

---

## 🛠️ Rodando Localmente

### Servidor HTTP (recomendado)

```bash
# Com npx (não precisa instalar nada)
npx serve .

# Com Python
python -m http.server 8080

# Com PHP
php -S localhost:8080
```

### Variáveis de ambiente (opcional)

Se quiser evitar digitar chaves toda vez, crie um arquivo `.env`:

```env
YOUTUBE_API_KEY= sua_chave_aqui
AI_PROVIDER= llm7
AI_API_KEY= sua_chave_aqui
```

---

## 📁 Estrutura do Projeto

```
buscador-sem-filtro/
├── index.html          # Interface principal
├── css/
│   └── style.css       # Estilos (dark theme)
├── js/
│   ├── app.js          # Lógica da interface e abas
│   ├── api.js         # Comunicação com YouTube Data API v3
│   ├── ai.js          # Comunicação com provedores de IA
│   ├── utils.js       # Funções auxiliares (formatação, favoritos, etc.)
│   └── pdf.js         # Geração de relatórios em PDF
├── img/
│   └── bg.png         # Background do hero (opcional)
├── GUIA_OLLAMA.md     # Guia completo para Ollama local
├── keys.txt.example   # Exemplo de formato de chaves
└── .gitignore         # Arquivos ignorados pelo Git
```

---

## 🔒 Segurança

- **Nenhuma chave é enviada para nossos servidores.** Toda comunicação é direta entre seu navegador e as APIs.
- Armazenamento local (localStorage) — você pode limpar a qualquer momento.
- `.gitignore` configurado para nunca commitar `keys.txt` ou arquivos sensíveis.

---

## 🤝 Contribuir

1. Fork o repositório
2. Crie uma branch: `git checkout -b minha-feature`
3. Commit: `git commit -m 'Adiciona nova funcionalidade'`
4. Push: `git push origin minha-feature`
5. Abra um Pull Request

---

## 📄 Licença

Este projeto é distribuído sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

---

## ⚠️ Limitações Conhecidas

- **Cota da YouTube API:** O uso gratuito é limitado. Para projetos maiores, considere migrar para uma conta paga.
- **Ollama local:** Requer hardware adequado. Modelos maiores (7B+) precisam de 8GB+ de RAM.
- **Favicon 404:** Se abrir pelo sistema de arquivos (`file://`), o navegador pode pedir um favicon. Ignore — não afeta funcionalidades.

---

**Made with 🔥 for the creator economy.**
