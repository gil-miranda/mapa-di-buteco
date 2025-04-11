# 🍻 Comida di Buteco – Mapa Interativo dos Bares

Um dia acordei querendo saber os bares participantes próximo de casa e então abri o ChatGPT:  

---

## 💡 Sobre o projeto

Este projeto faz o seguinte:

✅ Crawleia os bares participantes do Comida di Buteco em **todas as cidades**  
✅ Extrai nome, endereço, bairro, link oficial do bar  
✅ Faz **geocodificação** dos endereços (OpenStreetMap) para obter latitude e longitude  
✅ Gera arquivos CSV organizados por cidade  
✅ Exibe tudo em um **site estático interativo** com:

- Busca por bairro (sem acento, sem frescura)  
- Breadcrumbs clicáveis  
- Cards com detalhes dos bares  
- Mapa interativo com marcadores e popups  
- Link direto pra página do bar no site oficial  
- Totalmente responsivo, leve e acessível  
- Sem back-end, sem dependências pesadas

---

## 🧰 Feito com

- `Python` + `BeautifulSoup` + `requests` → crawler
- `Leaflet.js` → mapa interativo
- `PapaParse` → leitura de CSV no front-end
- `HTML + CSS + JS` → site estático
- Hospedagem via **GitHub Pages**
- E muitos prompts

---

## Colaboração

Fique a vontade para contribuir :)


📄 Licença: MIT

Este projeto está licenciado sob os termos da [Licença MIT](LICENSE).