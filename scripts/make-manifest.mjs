// Gera figma/manifest.json a partir das variantes dos component sets do Figma (arquivo Packs-de-Campanha).
import { writeFileSync } from 'node:fs';

const sets = {
  'SuperCoffee': { setId: '204:611', kind: 'produto', variants: [] },
  'Morning Shot': { setId: '2:19', kind: 'produto', variants: [] },
  'Koala': { setId: '2:42', kind: 'produto', variants: [] },
  'SuperCoffee Protein+': { setId: '6:799', kind: 'produto', variants: [] },
  'Caffeine Labs': { setId: '14:927', kind: 'produto', variants: [] },
  'Brinde': { setId: '177:2255', kind: 'brinde', variants: [] },
  'Brinde Caffeine Labs': { setId: '6:276', kind: 'brinde', variants: [] },
};

const sc = `204:612|Tamanho=380g, Sabor=Vanilla Latte, Posição=Frontal
204:613|Tamanho=220g, Sabor=Vanilla Latte, Posição=Frontal
204:614|Tamanho=380g, Sabor=Vanilla Latte, Posição=Verso
204:615|Tamanho=220g, Sabor=Vanilla Latte, Posição=Verso
204:616|Tamanho=380g, Sabor=Chocolate, Posição=Frontal
204:617|Tamanho=220g, Sabor=Chocolate, Posição=Frontal
204:618|Tamanho=380g, Sabor=Chocolate, Posição=Verso
204:619|Tamanho=220g, Sabor=Chocolate, Posição=Verso
204:620|Tamanho=380g, Sabor=Original, Posição=Frontal
204:621|Tamanho=220g, Sabor=Original, Posição=Frontal
204:622|Tamanho=380g, Sabor=Original, Posição=Verso
204:623|Tamanho=220g, Sabor=Original, Posição=Verso
204:624|Tamanho=380g, Sabor=Choconilla, Posição=Frontal
204:625|Tamanho=220g, Sabor=Choconilla, Posição=Frontal
204:626|Tamanho=380g, Sabor=Choconilla, Posição=Verso
204:627|Tamanho=220g, Sabor=Choconilla, Posição=Verso
204:628|Tamanho=380g, Sabor=Paçoca, Posição=Frontal
204:629|Tamanho=220g, Sabor=Paçoca, Posição=Frontal
204:630|Tamanho=380g, Sabor=Paçoca, Posição=Verso
204:631|Tamanho=220g, Sabor=Paçoca, Posição=Verso
204:632|Tamanho=380g, Sabor=Beijinho, Posição=Frontal
204:633|Tamanho=220g, Sabor=Beijinho, Posição=Frontal
204:634|Tamanho=380g, Sabor=Beijinho, Posição=Verso
204:635|Tamanho=220g, Sabor=Beijinho, Posição=Verso
204:636|Tamanho=380g, Sabor=Pistache, Posição=Frontal
204:637|Tamanho=220g, Sabor=Pistache, Posição=Frontal
204:638|Tamanho=380g, Sabor=Pistache, Posição=Verso
204:639|Tamanho=220g, Sabor=Pistache, Posição=Verso
204:640|Tamanho=380g, Sabor=Chocolate Língua de Gato, Posição=Frontal
204:641|Tamanho=220g, Sabor=Chocolate Língua de Gato, Posição=Frontal
204:642|Tamanho=380g, Sabor=Chocolate Língua de Gato, Posição=Verso
204:643|Tamanho=220g, Sabor=Chocolate Língua de Gato, Posição=Verso
204:644|Tamanho=380g, Sabor=Doce de Leite, Posição=Frontal
204:645|Tamanho=220g, Sabor=Doce de Leite, Posição=Frontal
204:646|Tamanho=380g, Sabor=Doce de Leite, Posição=Verso
204:647|Tamanho=220g, Sabor=Doce de Leite, Posição=Verso
204:648|Tamanho=380g, Sabor=Chocolate Lajotinha, Posição=Frontal
204:649|Tamanho=220g, Sabor=Chocolate Lajotinha, Posição=Frontal
204:650|Tamanho=380g, Sabor=Chocolate Lajotinha, Posição=Verso
204:651|Tamanho=220g, Sabor=Chocolate Lajotinha, Posição=Verso
204:652|Tamanho=380g, Sabor=Creme de Avelã, Posição=Frontal
204:653|Tamanho=220g, Sabor=Creme de Avelã, Posição=Frontal
204:654|Tamanho=To go, Sabor=Choconilla, Posição=Frontal
204:655|Tamanho=To go, Sabor=Original, Posição=Frontal
204:656|Tamanho=To go, Sabor=Vanilla Latte, Posição=Frontal
204:657|Tamanho=To go, Sabor=Chocolate, Posição=Frontal
204:658|Tamanho=To go, Sabor=Beijinho, Posição=Frontal
204:659|Tamanho=To go, Sabor=Pistache, Posição=Frontal
204:660|Tamanho=To go, Sabor=Chocolate Língua de Gato, Posição=Frontal
204:661|Tamanho=To go, Sabor=Doce de Leite, Posição=Frontal
204:662|Tamanho=To go, Sabor=Chocolate Lajotinha, Posição=Frontal
204:663|Tamanho=Sachê, Sabor=Choconilla, Posição=Frontal
204:664|Tamanho=Sachê, Sabor=Original, Posição=Frontal
204:665|Tamanho=Sachê, Sabor=Vanilla Latte, Posição=Frontal
204:666|Tamanho=Sachê, Sabor=Beijinho, Posição=Frontal
204:667|Tamanho=Sachê, Sabor=Pistache, Posição=Frontal
204:668|Tamanho=Sachê, Sabor=Chocolate Língua de Gato, Posição=Frontal
204:669|Tamanho=Sachê, Sabor=Doce de Leite, Posição=Frontal
204:670|Tamanho=Sachê, Sabor=Chocolate Lajotinha, Posição=Frontal
204:671|Tamanho=Sachê, Sabor=Chocolate Lajotinha Sampling, Posição=Frontal
204:672|Tamanho=Sachê, Sabor=Chocolate, Posição=Frontal
204:673|Tamanho=PPB, Sabor=Choconilla, Posição=Frontal
204:674|Tamanho=PPB, Sabor=Vanilla Latte, Posição=Frontal
204:675|Tamanho=PPB, Sabor=Beijinho, Posição=Frontal`;

const ms = `2:20|Sabor=Tangerina, Posição=Frontal, Tamanho=Classic
5:2|Sabor=Limão, Posição=Frontal, Tamanho=Classic
5:6|Sabor=Melancia, Posição=Frontal, Tamanho=Classic
5:10|Sabor=Limão, Posição=Verso, Tamanho=Classic
5:14|Sabor=Tangerina, Posição=Verso, Tamanho=Classic
5:18|Sabor=Melancia, Posição=Verso, Tamanho=Classic
5:22|Sabor=Limão, Posição=Frontal, Tamanho=Travel Size
5:26|Sabor=Tangerina, Posição=Frontal, Tamanho=Travel Size
5:30|Sabor=Melancia, Posição=Frontal, Tamanho=Travel Size
5:34|Sabor=Limão, Posição=Frontal, Tamanho=Sachê
5:38|Sabor=Tangerina, Posição=Frontal, Tamanho=Sachê
5:42|Sabor=Melancia, Posição=Frontal, Tamanho=Sachê`;

const koala = `2:43|Tamanho=264g, Sabor=Chocolate, Posição=Frontal
3:94|Tamanho=456g, Sabor=Chocolate, Posição=Frontal
3:98|Tamanho=456g, Sabor=Morango, Posição=Frontal
3:102|Tamanho=264g, Sabor=Morango, Posição=Frontal
3:106|Tamanho=456g, Sabor=Baunilha, Posição=Frontal
3:110|Tamanho=264g, Sabor=Baunilha, Posição=Frontal
3:114|Tamanho=456g, Sabor=Chocolate, Posição=Verso
3:118|Tamanho=264g, Sabor=Chocolate, Posição=Verso
3:122|Tamanho=456g, Sabor=Morango, Posição=Verso
3:126|Tamanho=264g, Sabor=Morango, Posição=Verso
3:130|Tamanho=456g, Sabor=Baunilha, Posição=Verso
3:134|Tamanho=264g, Sabor=Baunilha, Posição=Verso
3:138|Tamanho=To go, Sabor=Chocolate, Posição=Frontal
3:142|Tamanho=To go, Sabor=Morango, Posição=Frontal
3:146|Tamanho=To go, Sabor=Baunilha, Posição=Frontal
3:150|Tamanho=Sachê, Sabor=Chocolate, Posição=Frontal
3:154|Tamanho=Sachê, Sabor=Morango, Posição=Frontal
3:158|Tamanho=Sachê, Sabor=Baunilha, Posição=Frontal
3:162|Tamanho=60g, Sabor=Chocolate, Posição=Frontal`;

const protein = `6:800|Tamanho=465g, Sabor=Caramel Macchiato, Posição=Frontal
6:801|Tamanho=465g, Sabor=Caramel Macchiato, Posição=Lado
6:802|Tamanho=465g, Sabor=Caramel Macchiato, Posição=Verso
6:803|Tamanho=465g, Sabor=Iced Cappuccino, Posição=Frontal
6:804|Tamanho=465g, Sabor=Iced Cappuccino, Posição=Lado
6:805|Tamanho=465g, Sabor=Iced Cappuccino, Posição=Verso`;

const labs = `14:928|Produto=Creatina, Sabor=Sem sabor, Posição=Frontal
14:929|Produto=Whey Protein, Sabor=Chocolate, Posição=Frontal
14:930|Produto=Whey Protein, Sabor=Baunilha, Posição=Frontal`;

const brinde = `177:2256|Objeto=Necessaire, Modelo=Be Ready, Position=Default
177:2257|Objeto=Caffeine Army, Modelo=ProductPic, Position=Default
177:2258|Objeto=Multipack, Modelo=Smart Life, Position=Default
177:2259|Objeto=Necessaire, Modelo=GRUPO, Position=Default
177:2260|Objeto=Necessaire, Modelo=Summer 2026, Position=Default
177:2261|Objeto=Necessaire, Modelo=Protein+, Position=Default
177:2262|Objeto=Necessaire, Modelo=Protein+, Position=Side
177:2263|Objeto=Mala, Modelo=SDC, Position=Front
177:2264|Objeto=Mala, Modelo=SDC, Position=Side
177:2265|Objeto=Bolsa, Modelo=Protein+, Position=Default
177:2266|Objeto=Ecobag, Modelo=Summer 2025, Position=Default
177:2267|Objeto=Ecobag, Modelo=ProductPic, Position=Default
177:2268|Objeto=Ecobag, Modelo=Summer 2026, Position=Up
177:2269|Objeto=Ecobag, Modelo=Summer 2026, Position=Down
177:2270|Objeto=Viseira, Modelo=Be Unstoppable, Position=Default
177:2271|Objeto=Viseira, Modelo=Summer 2026, Position=Default
177:2272|Objeto=Boné, Modelo=ProductPic, Position=Default
177:2273|Objeto=Boné, Modelo=Living Smart, Position=Front
177:2274|Objeto=Boné, Modelo=Living Smart, Position=Side
177:2275|Objeto=Casaco, Modelo=ProductPic, Position=Default
177:2276|Objeto=Multipack, Modelo=ProductPic, Position=Default
177:2277|Objeto=Multipack, Modelo=Be Unstoppable, Position=Default
177:2278|Objeto=Multipack, Modelo=Protein+, Position=Default
177:2279|Objeto=Multipack, Modelo=Be Unstoppable, Position=Up
177:2280|Objeto=Caneca, Modelo=ProductPic, Position=Default
177:2281|Objeto=Multipack, Modelo=Enjoy the journey, Position=Default
177:2282|Objeto=Caneca, Modelo=Starterpack, Position=Default
177:2283|Objeto=Caneca, Modelo=Starterpack, Position=Side
177:2284|Objeto=Caneca, Modelo=Prime Week, Position=Default
177:2285|Objeto=Caneca, Modelo=SDC, Position=Front
177:2286|Objeto=Caneca, Modelo=SDC, Position=Back
177:2287|Objeto=Copo Termico, Modelo=Black Friday 2024, Position=Default
177:2288|Objeto=Copo Termico, Modelo=Black Friday 2025, Position=Default
177:2289|Objeto=Coqueteleira, Modelo=ProductPic, Position=Default
177:2290|Objeto=Prime, Modelo=ProductPic, Position=Default
177:2291|Objeto=Copo, Modelo=ProductPic, Position=Default
177:2292|Objeto=Garrafa, Modelo=Vidro, Position=Default
177:2293|Objeto=Copo, Modelo=Vidro, Position=Default
177:2294|Objeto=Copo, Modelo=Vidro, Position=Full
177:2295|Objeto=Creme, Modelo=Dia das Mães, Position=Default
177:2296|Objeto=Mixer, Modelo=Starterpack, Position=Default
177:2297|Objeto=Mixer, Modelo=GRUPO, Position=Default
177:2298|Objeto=Mixer, Modelo=Prime Week, Position=Default
177:2299|Objeto=Mixer, Modelo=Prime Week, Position=Front
177:2300|Objeto=Mixer, Modelo=Prime Week, Position=Placed
177:2301|Objeto=Sachês, Modelo=Starterpack, Position=Default
177:2302|Objeto=Sachês, Modelo=Always On, Position=Open
177:2303|Objeto=Sachês, Modelo=Always On, Position=Default
177:2304|Objeto=Sachês, Modelo=Caffeine Labs, Position=Default
177:2305|Objeto=Sachês, Modelo=Lajotinha, Position=Default
177:2306|Objeto=Samplings, Modelo=Lajotinha, Position=Default
177:2307|Objeto=Kopenhagen, Modelo=Mini-lajotinha, Position=Default
177:2308|Objeto=Haoma, Modelo=Biscottino, Position=Default
177:2309|Objeto=Natal, Modelo=Caixa, Position=Default
177:2310|Objeto=Natal, Modelo=Cartão, Position=Default
177:2311|Objeto=Haoma, Modelo=Bombom, Position=Default
177:2312|Objeto=Haoma, Modelo=Chocolate Caramelizado, Position=Default
177:2313|Objeto=Caneca, Modelo=Semana do Cliente, Position=Default
177:2314|Objeto=Mixer, Modelo=Semana do Cliente, Position=Default
177:2315|Objeto=Necessaire, Modelo=Semana do Cliente, Position=Default
177:2316|Objeto=Bolsa, Modelo=Semana do Cliente, Position=Default`;

const parse = (txt) => txt.split('\n').map((l) => {
  const [id, props] = l.split('|');
  const p = Object.fromEntries(props.split(', ').map((kv) => kv.split('=').map((s) => s.trim())));
  return { nodeId: id, props: p };
});

sets['SuperCoffee'].variants = parse(sc);
sets['Morning Shot'].variants = parse(ms);
sets['Koala'].variants = parse(koala);
sets['SuperCoffee Protein+'].variants = parse(protein);
sets['Caffeine Labs'].variants = parse(labs);
sets['Brinde'].variants = parse(brinde);
sets['Brinde Caffeine Labs'].variants = [{ nodeId: '6:277', props: { Objeto: 'Coqueteleira', Modelo: 'Caffeine Labs', Position: 'Default' } }];
// Leque de sachês usado nos packs Always On: retângulo com imagem girado 22.8°, exportado já girado (escala 4)
sets['Brinde'].variants.push({ nodeId: '204:237', props: { Objeto: 'Sachês', Modelo: 'Always On Leque', Position: 'Default' }, scale: 4 });

const manifest = [];
for (const [line, s] of Object.entries(sets)) {
  for (const v of s.variants) manifest.push({ line, kind: s.kind, setId: s.setId, ...v });
}
writeFileSync(new URL('../figma/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2));
console.log(manifest.length, 'variants');
