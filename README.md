# Inklink

*A cozy word-association logic puzzle — find where each clue links two words.*

Puzzle solo inspirado na mecânica do *Entre-linhas*: cada peça precisa ir para o quadro onde combina com a palavra da linha **e** a da coluna. Peças ambíguas, quadros vazios e contagens por linha/coluna transformam a associação em dedução (à la Sudoku / enigma de Einstein).

## Rodando

```bash
npm install
npm run dev          # jogo no navegador
npm test             # valida todos os níveis + motor lógico
npm run levels       # relatório de dificuldade (add -- --steps para o passo a passo)
npm run build        # build estático em dist/ (base relativa: itch.io, GitHub Pages...)
```

## Estrutura

```
src/
  core/        lógica pura, sem DOM (reutilizável no gerador de PDF / Godot)
    types.ts     formato JSON dos níveis
    puzzle.ts    validação + indexação (bitmasks)
    solver.ts    busca exaustiva (contagem de soluções)
    deduce.ts    solucionador "humano" por técnicas → dificuldade e dicas
    explain.ts   texto em português para cada passo lógico
    analyze.ts   análise de nível + explorador de soluções (autoria)
  game/        estado de jogo (sessão, desfazer, persistência, dicas)
  levels/      níveis *.json (ordem = nome do arquivo)
  ui/          interface web (DOM puro + CSS)
scripts/       ferramentas de linha de comando para autoria
tests/
```

## Formato de nível

```jsonc
{
  "id": "fazenda",
  "title": "A Fazenda",
  "counts": "cols",               // none | rows | cols | both — contagens impressas no tabuleiro
  "rows": [{ "id": "vaca", "label": "Vaca", "icon": "🐄" }],
  "cols": [{ "id": "cafe", "label": "Café da manhã", "icon": "☕" }],
  "clues": [
    // candidates = todos os quadros onde a peça é plausível ("linha+coluna")
    { "id": "leite", "label": "Leite", "icon": "🥛", "candidates": ["vaca+cafe", "vaca+feira"] }
  ],
  "solution": { "leite": "vaca+cafe" }
}
```

`icon` aceita emoji ou caminho de imagem (`assets/leite.svg` em `public/`).

### Regras de design descobertas pelo solver

- **Tabuleiro cheio** (peças = quadros) sem regras extras sempre se resolve só com "só cabe aqui" — nunca exige hipóteses.
- **Quadros vazios sem contagem** tornam o nível ambíguo sempre que uma peça tem candidato num quadro vazio.
- As **contagens** (linha/coluna) são o que cria dedução não local e a necessidade de testar hipóteses.

### Fluxo de autoria

1. Escreva palavras e peças com seus `candidates` (o que é *plausível*, com generosidade).
2. `npm run levels:explore -- src/levels/meu-nivel.json` lista soluções + modo de contagem que deixam o nível com solução única, da mais difícil para a mais fácil.
3. Copie `counts` e `solution`, rode `npm run levels` e `npm test`.
