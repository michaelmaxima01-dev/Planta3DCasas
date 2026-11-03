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

## Desenho preciso

| Como | O que faz |
|---|---|
| **Projeto em branco** (botão Novo) | Cartão de início: digite largura × profundidade e clique em *Criar contorno* |
| **Cômodo (C)** | Clique num canto e no canto oposto, ou digite `4x3` + Enter: cria as 4 paredes |
| **Parede (W)** + medida digitada | Depois do primeiro clique, digite `3,5` + Enter: parede de 3,50 m exatos na direção do mouse; continue digitando para a próxima |
| **Shift** | Trava a parede em horizontal/vertical |
| **Clique na cota** (ferramenta Selecionar) | Abre um campo para digitar o novo comprimento; o cômodo estica mantendo os encontros em T |
| Caixa no canto da planta | Mostra o que está sendo digitado e as dicas da ferramenta |

## Redimensionar, girar e marcar

- **Alças**: selecione um móvel ou escada e arraste as alças das laterais para mudar largura e
  profundidade (o lado oposto fica parado) ou a bolinha azul para girar (de 15 em 15°, Alt solta livre).
  Portas e janelas ganham alças nas pontas para mudar a largura.
- **Marcações** (barra lateral): Lápis (L) para desenhar à mão livre, Seta (A), Texto (T) e Medir (M),
  com 6 cores. Selecione para mover ou apagar (Delete). Saem no PDF e no DXF (camada ANOTACOES).

## Mobiliar automaticamente

Clique num cômodo, escolha o **Tipo do cômodo** (sala, cozinha, jantar, suíte, quarto, infantil,
banheiro, lavabo, lavanderia, escritório, garagem, varanda) e clique em **Mobiliar automaticamente**:
os móveis certos são distribuídos encostados nas paredes, sem bloquear portas nem sobrepor nada
(cama com criados-mudos dos lados, mesa com cadeiras em volta, mesa de centro em frente ao sofá…).

## Escadas e vãos

Categoria **Escadas** do catálogo: reta, reta com patamar, em L, em U, caracol, flutuante e marinheiro. Ao colocar,
a escada é dimensionada pela altura do andar (fórmula de Blondel) e o **vão é aberto automaticamente
no piso do andar de cima** (marcado com X na planta, guarda-corpo no 3D, área descontada da laje),
para qualquer andar: térreo → 1º, 1º → 2º e assim por diante. Se não houver andar acima, o sistema avisa.

## Esquadrias e elementos

- Portas: de giro, de correr, dupla, pivotante. Janelas: de correr, basculante, maxim-ar, porta-janela.
  Escolha o tipo na barra lateral ao usar Porta (D) ou Janela (J), ou troque no painel de propriedades.
- Catálogo com 80 itens: sala, quarto, cozinha, banheiro, escritório, **lavanderia**, **área externa
  e garagem** (piscina, churrasqueira, árvores, carro…), iluminação e escadas.

## Roteiro de teste manual

Ao abrir, aparece um sobrado de exemplo (10 × 8 m, térreo + 1º andar, 9 cômodos).
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
| **Estrutura** | Engenheiro | Relatório estrutural avulso (fôrmas, fundação, tabelas, caminho das cargas e termo de responsabilidade com assinatura). No PDF do projeto, a opção *Estrutura* acrescenta essas folhas no fim do caderno, com o carimbo do engenheiro. No DXF, a opção *Estrutura* acrescenta as camadas PILARES, VIGAS e LAJES, e o desenho *Locação da fundação* gera sapatas/blocos (camada FUNDACAO), baldrames e pilares |
| **JSON** (botão Salvar) | Arquivo-mestre | Tudo, inclusive o comportamento paramétrico. É o único que abre de volta aqui |

Os dados do carimbo (projeto, cliente, endereço, responsável, CAU/CREA) são preenchidos na janela de exportação e ficam salvos no projeto.

**Testar:** Exportar → preencher o carimbo → *Baixar PDF* e *Baixar DXF*. Abrir o DXF no AutoCAD
(ou no LibreCAD/DraftSight, que são gratuitos) e conferir camadas, blocos de móveis e o comando ÁREA num cômodo.

## Andares

- **Seletor de andares** fixo no canto da planta (o andar de cima fica no alto, como num elevador);
  **PageUp/PageDown** sobe e desce.
- **+ Andar** abre a janela *Adicionar andar*: escolha começar pelo contorno da casa, repetir a planta
  ou andar vazio. Por padrão o sistema **cria a escada** no andar de baixo (fórmula de Blondel:
  espelho ≤ 18,5 cm), escolhendo uma parede livre longe das portas, e avisa se algum móvel ficou no caminho.
- O **piso do novo andar** (laje sobre os cômodos de baixo) aparece na planta e no 3D desde o início;
  o **vão da escada** fica aberto na laje, marcado com X na planta e com guarda-corpo no 3D.
- A planta de baixo aparece tracejada e seus cantos servem de encaixe para alinhar as paredes.
- **Ver andares de cima** mostra o prédio inteiro no 3D, com o telhado.

## Telhado

No painel lateral: formato (duas águas, quatro águas, uma água ou laje plana), **telha** (cerâmica
portuguesa, romana, colonial, francesa, concreto, fibrocimento, metálica, sanduíche, shingle), inclinação
(com alerta abaixo do mínimo da telha), beiral, direção da cumeeira e **sustentação**:
- *Sobre a laje (pontaletes)*: o telhado descarrega na laje de cobertura;
- *Tesouras de madeira (forro)*: sem laje no último andar; tesouras a cada ~3 m descarregam nas vigas de
  respaldo das paredes de beiral (a carga entra nessas vigas no cálculo).
Terças, caibros e banzos são verificados e a seção de madeira é escolhida automaticamente.
Quantitativos: telhas, cumeeiras, ripas, caibros, terças, pontaletes ou tesouras, calhas, condutores,
rufos, pregos, manta e madeira em m³.
O telhado aparece no 3D e a planta de cobertura (beiral, cumeeira, espigões e caimento) no último andar.
Na aba Estrutura: madeiramento (terças sobre pontaletes na laje), verificação da terça, quantidade de
telhas, ripas, caibros, terças e pontaletes, e o peso do telhado entra nas cargas.

## Aba Estrutura (botão amarelo **Estrutura**)

Pré-dimensionamento de concreto armado com alvenaria de vedação, da fundação à cobertura:

1. **Gerar estrutura**: lança pilares nos cantos e encontros de paredes (contínuos até a fundação),
   pilares intermediários quando o vão passa do máximo (evitando portas e janelas), vigas sobre as paredes de
   cada pavimento, lajes em cada cômodo e baldrames sob o térreo; em seguida dimensiona as seções.
2. **Tramitação das cargas**: laje → vigas → pilares → pilar de baixo (ou viga de transição) → pilar do
   térreo + baldrames → fundação → solo. Um teste automático garante que toda a carga chega à fundação.
3. **Verificação** (verde atende / amarelo atenção / vermelho não atende):
   - lajes por vão (maciça ou treliçada H8 a H20), cargas de peso próprio, revestimento, uso e cobertura;
   - vigas biapoiadas: momento, cortante, armadura de flexão, estribos, biela, altura x vão;
   - pilares por área de influência (coeficientes de canto/extremidade/interno), γn, armadura, esbeltez,
     seção mínima;
   - fundação: sapatas pela tensão admissível do solo, **sapata associada automática** quando pilares
     vizinhos teriam sapatas sobrepostas, radier ou estacas;
   - paredes do andar de cima sem viga embaixo, pilares sem caminho até a fundação, carga média por m²;
   - vão da escada descontado da laje e metade do peso da escada apoiada nela.
   Pilares só descem quando há parede embaixo; paredes de cima sem parede embaixo ganham **viga de
   transição** automática (nada de pilar solto no meio de um cômodo).
4. Clique em qualquer peça para ver a **memória de cálculo** e editar a seção; arraste pilares
   (o eixo se move em todos os pavimentos); ferramentas **Pilar** (P) e **Viga** (G) para lançamento manual.
5. Parâmetros editáveis: solo e tensão admissível, tipo de fundação, profundidade, concreto (C20 a C40),
   tipo de laje, cobertura, sobrecarga, revestimento, peso da alvenaria e vão máximo entre pilares.
6. **Quantitativo de materiais por etapa** (abas Fundação / Estrutura / Alvenaria / Telhado / Total no
   painel; na vista Fundação abre direto na aba Fundação; uma folha por etapa no relatório): concreto por peça (sapatas, arranques, baldrames,
   pilares, vigas, lajes), cimento em sacos, areia, brita, cal, água, aço por bitola, fôrmas, vigotas e
   lajotas, blocos, argamassas, contrapiso, escavação e telhado, com perdas incluídas.
7. **Relatório estrutural (PDF)**: premissas, pendências, plantas de fôrmas por pavimento, locação da
   fundação, tabelas de lajes/vigas/pilares/fundações, caminho das cargas, telhado, quantitativo de
   materiais e **termo de responsabilidade técnica com campo de assinatura** do engenheiro.

Critérios simplificados das NBR 6118, 6120, 6122 e 8681; a validação final e a assinatura são do
engenheiro responsável, e a tensão admissível do solo deve vir de sondagem SPT.

Exemplos prontos em `exemplos/`: caderno completo do sobrado (arquitetura + estrutura), relatório estrutural, DXF do térreo com a estrutura e DXF da locação da fundação.

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
  roof/        telhado: geometria, madeiramento, verificação e quantitativos
  structure/   modelo estrutural, lançamento automático, análise/verificação, relatório e telas da aba Estrutura
  ui/          barra superior, ferramentas/catálogo, painel de propriedades, janela de exportação
```

A geometria fica isolada em `src/geometry` para poder ser trocada por um núcleo em Rust/WebAssembly no futuro sem mexer na interface.

## Publicar na Hostinger

1. Gere o pacote: `pnpm build` (ou use o pronto em `hostinger/planta3dcasas-hostinger.zip`).
2. hPanel → **Arquivos → Gerenciador de arquivos** → abra `public_html` (ou uma subpasta, ex. `public_html/planta`).
3. **Enviar** o `.zip` → clique com o botão direito → **Extrair** ali mesmo. O `index.html` deve ficar direto dentro da pasta.
4. Acesse o domínio. Login: `admin` / `admin2410` (definido em `src/ui/Login.tsx`).

O `.htaccess` incluso ativa compressão e cache. Para forçar HTTPS, descomente as 2 linhas indicadas nele.

## Pacote de objetos v6.0

- **Planos prontos** (barra lateral): garagem de 1, 2 (lado a lado ou em fila) e 3 vagas, com portão, vagas demarcadas 2,50 × 5,00 m e carros; quartos, banheiro, cozinha, cozinha americana com balcão, área gourmet e jardim de inverno. Um clique na planta cria as paredes, nomeia o cômodo e mobilia.
- **Novas categorias**: Jardim (árvores, ipês, palmeira, bambu, cerca viva, canteiros, horta, gramado, deck, pergolado, quiosque, fonte, espelho d'água, iluminação), Garagem (vagas, SUV, hatch, moto, bicicleta, bancada, estantes), Vidros e divisórias (vidro temperado, parede de vidro com caixilho, box blindex, guarda-corpo, cobogó, painel ripado), Área gourmet (churrasqueira com bancada, forno de pizza, fogão a lenha, cervejeira, rede, spa).
- **Cozinha**: balcão de mármore (divisória cozinha/sala), com banquetas, península e ilha; pia com gabinete, cozinha planejada em L, torre quente, mesa 6 e 8 lugares, canto alemão.
- **Escadas**: L virando à esquerda, L com leque, U lance duplo, U de três lances, imperial, concreto armado, metálica, degraus de entrada e rampa acessível (NBR 9050).
- **Esquadrias**: portão basculante e de correr, porta de vidro temperado, porta camarão, janela com veneziana, vidro fixo e pele de vidro.
