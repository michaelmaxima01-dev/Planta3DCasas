# Planta3D Casas

Editor de plantas de casas em 2D e 3D no navegador: paredes com junções automáticas,
cômodos detectados com área calculada, portas, janelas, catálogo de móveis e iluminação.

Stack: **TypeScript + React + Vite**, **Three.js / React Three Fiber** no 3D,
**SVG** na planta 2D, **Zustand + Zundo** para estado e desfazer/refazer, **Vitest** nos testes.

## Como rodar

```bash
pnpm install
pnpm dev        # abre em http://localhost:5173
pnpm test       # testes automáticos da geometria e das operações
pnpm build      # build de produção
```

## Roteiro de teste manual

Ao abrir, aparece uma casa de exemplo (10 × 8 m, 4 cômodos, 27 móveis).
O projeto é salvo sozinho no navegador; **Exemplo** recarrega a casa e **Novo** começa do zero.

| O que testar | Como |
|---|---|
| Desenhar paredes | Tecla **W** (ou botão Parede) → clique em cada canto → duplo clique, Enter ou Esc termina. Clicar no ponto inicial fecha o cômodo |
| Encaixes | Círculo **verde** = canto existente, **laranja** = meio de parede (cria junção em T), linha tracejada = alinhamento. Ângulos de 45° e grade de 5 cm. **Alt** desliga |
| Cômodo automático | Ao fechar um contorno, o piso, o nome e a área útil aparecem na planta e no 3D |
| Porta / janela | **D** ou **J** → clique sobre uma parede. Arraste para mover ao longo da parede |
| Móveis | Clique num item do catálogo → clique na planta. Perto da parede ele encosta de costas sozinho |
| Selecionar e editar | **V** → clique em parede, canto, porta, móvel ou cômodo. O painel da direita mostra as medidas editáveis |
| Mover | Arraste paredes, cantos (as junções se refazem), móveis e aberturas |
| Juntar cantos | Solte um canto sobre outro canto (junta) ou sobre uma parede (junção em T) |
| Renomear cômodo / piso | Clique no cômodo → mude o nome e escolha a cor do piso |
| Girar móvel | Selecione e aperte **R** (90°) ou digite a rotação no painel |
| Duplicar / excluir | **Ctrl+D** duplica o móvel selecionado • **Delete** exclui o que estiver selecionado |
| Desfazer / refazer | **Ctrl+Z** / **Ctrl+Y** (ou Ctrl+Shift+Z). Um arraste inteiro vira um único passo |
| Vistas | Botões **2D**, **2D + 3D**, **3D**. No 3D: arraste gira, botão direito move, roda dá zoom. Clicar no 3D também seleciona |
| Paredes baixas | Corta as paredes a 1,2 m no 3D para ver o interior por cima |
| Salvar / abrir | **Salvar** baixa um `planta.json`; **Abrir** carrega de volta |
| Navegar na planta | Roda do mouse = zoom no cursor • arrastar o fundo ou botão direito = mover • **Enquadrar** centraliza |

## Organização do código

```
src/
  geometry/    matemática pura (sem React), coberta por testes
    vec.ts       vetores, interseções, áreas
    walls.ts     contorno das paredes com junções (miter) e prismas com vãos de portas/janelas
    rooms.ts     detecção de cômodos (faces do grafo planar) e área útil
    snap.ts      encaixes do cursor e de móveis na parede
  model/       tipos do documento e operações de edição (adicionar/dividir/juntar paredes...)
  catalog/     móveis procedurais: as mesmas peças geram o símbolo 2D e o modelo 3D
  store/       estado da planta (com histórico) e estado da interface
  editor2d/    planta 2D em SVG (ferramentas, cotas, símbolos)
  view3d/      cena 3D (paredes, pisos, aberturas, móveis, luzes)
  ui/          barra superior, ferramentas/catálogo, painel de propriedades
```

A geometria fica isolada em `src/geometry` para poder ser trocada por um núcleo em Rust/WebAssembly no futuro sem mexer na interface.
