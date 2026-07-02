# Loteamento Interativo - Terras

Site estatico para demonstrar a divisao de um terreno de 7 hectares em lotes clicaveis.

## O que o site faz

- Gera 330 lotes interativos: 6 fileiras com 55 lotes.
- Mostra a medida individual de cada lote ao clicar.
- Calcula frente, profundidade inicial, profundidade final, profundidade media e area estimada.
- Abre o Google Maps no ponto aproximado do lote selecionado.
- Usa as imagens enviadas como referencia visual do terreno.

## Dados usados

- Frente: 168 m
- Fundo: 110 m
- Profundidade: 503,6 m
- Area total: 70.000 m2
- Ruas internas: 3 ruas de 10 m da frente ao fundo
- Area util estimada para lotes: 54.892,4 m2
- Lotes: 330

As coordenadas dos lotes sao aproximadas para demonstracao. Para uso oficial, a proposta deve ser conferida por topografia e pela prefeitura.

## Rodar localmente

Abra `index.html` no navegador ou use um servidor estatico:

```bash
npm run dev
```

## Deploy na Vercel

O projeto e estatico. A Vercel pode publicar direto da raiz do repositorio.
