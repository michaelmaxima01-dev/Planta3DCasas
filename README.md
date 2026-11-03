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

## Exportação (botão verde **Exportar**)

| Formato | Para quê | O que leva |
|---|---|---|
| **PDF** | Cliente e obra | Capa com 3D, planta baixa em escala (automática ou 1:25 a 1:125) com cotas, quadro de áreas, quadro de esquadrias (P1, J1…), uma folha por cômodo (desenho recortado com medidas internas, área, perímetro, pé-direito, volume, piso, área de paredes, rodapé, portas, janelas e móveis), lista de mobiliário e vistas 3D. Carimbo em todas as folhas, A3 ou A4 |
| **DXF** | AutoCAD, BricsCAD, DraftSight, LibreCAD | Planta 2D em escala real (m, cm ou mm) com camadas PAREDES, PORTAS, JANELAS, MOVEIS, COTAS, TEXTOS, COMODOS e PAREDES-HACHURA; móveis como blocos; contorno dos cômodos medível com ÁREA. Para DWG: abrir no AutoCAD e usar *Salvar como* |
| **JSON** (botão Salvar) | Arquivo-mestre | Tudo, inclusive o comportamento paramétrico. É o único que abre de volta aqui |

Os dados do carimbo (projeto, cliente, endereço, responsável, CAU/CREA) são preenchidos na janela de exportação e ficam salvos no projeto.

**Testar:** Exportar → preencher o carimbo → *Baixar PDF* e *Baixar DXF*. Abrir o DXF no AutoCAD
(ou no LibreCAD/DraftSight, que são gratuitos) e conferir camadas, blocos de móveis e o comando ÁREA num cômodo.

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
  export/      levantamento (schedule), desenho técnico comum (drawing), PDF, DXF e imagens 3D
  ui/          barra superior, ferramentas/catálogo, painel de propriedades, janela de exportação
```

A geometria fica isolada em `src/geometry` para poder ser trocada por um núcleo em Rust/WebAssembly no futuro sem mexer na interface.
