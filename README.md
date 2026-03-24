# ⚡ S-ONE Bot — Documentation complète
> **Designed by Hackend — Systeme.one**

---

## 📋 Table des matières

1. [Présentation](#présentation)
2. [Prérequis](#prérequis)
3. [Installation](#installation)
4. [Configuration `.env`](#configuration-env)
5. [Démarrage](#démarrage)
6. [Commandes](#commandes)
7. [Système de points](#système-de-points)
8. [Intégration n8n](#intégration-n8n)
9. [Architecture des fichiers](#architecture)
10. [Déploiement en production](#déploiement)

---

## 🎯 Présentation

**S-ONE Bot** est un bot Discord tout-en-un conçu pour les infopreneurs utilisant **Systeme One**. Il permet de :

- 🔑 **Contrôler l'accès** au serveur via une clé de licence unique
- 🏆 **Récompenser les élèves** automatiquement (conférences, focus vocal, messages, témoignages)
- 🎥 **Gérer les témoignages vidéo** avec intégration Google Drive via n8n
- 👤 **Administrer les membres** (profil complet, points, prison, notes)
- 🌐 **Se connecter à la webapp** de votre store de points

---

## ✅ Prérequis

| Outil | Version minimale |
|-------|-----------------|
| Node.js | `18.0.0` |
| npm | `8.0.0` |
| Instance n8n | Accessible en HTTPS |
| Bot Discord | Créé sur [discord.dev](https://discord.com/developers) |

### Permissions requises pour le bot Discord

Dans le **Discord Developer Portal**, activez :
- ✅ `bot`
- ✅ `applications.commands`

Intents à activer (**Privileged Gateway Intents**) :
- ✅ `SERVER MEMBERS INTENT`
- ✅ `MESSAGE CONTENT INTENT`

Permissions bot (OAuth2 URL Generator) :
```
Administrator  (recommandé pour le setup initial)
```
Ou permissions minimales :
```
Manage Roles | Manage Channels | Send Messages | Embed Links
Read Message History | Add Reactions | Move Members | Moderate Members
```

---

## 🚀 Installation

```bash
# 1. Cloner / extraire le projet
cd sone-bot

# 2. Installer les dépendances
npm install

# 3. Copier et remplir le fichier .env
cp .env.example .env
nano .env   # ou code .env

# 4. Enregistrer les slash commands Discord
node deploy-commands.js

# 5. Démarrer le bot
npm start
```

---

## ⚙️ Configuration `.env`

```env
# ── Discord ──────────────────────────────────────────────
DISCORD_TOKEN=         # Token du bot (Discord Dev Portal)
CLIENT_ID=             # Application ID du bot

# ── Licence ──────────────────────────────────────────────
# Clé unique à donner à chaque client (format libre)
LICENSE_KEY=SONE-XXXX-XXXX-XXXX-XXXX

# ── n8n ──────────────────────────────────────────────────
N8N_WEBHOOK_SECRET=    # Secret HMAC partagé avec n8n
N8N_BASE_URL=          # https://votre-n8n.com

# Webhooks spécifiques
N8N_TESTIMONIAL_CREATE_URL=   # Crée le dossier Drive
N8N_TESTIMONIAL_CHECK_URL=    # Vérifie si vidéo déposée

# ── API interne ───────────────────────────────────────────
API_PORT=3000          # Port Express (callbacks n8n → bot)

# ── Super-admin ───────────────────────────────────────────
HACKEND_USER_ID=1223607698113695836
```

---

## 🎮 Commandes

### 🔧 Administration

| Commande | Rôle requis | Description |
|----------|-------------|-------------|
| `/setup` | Administrateur | Lance l'assistant de configuration (nécessite la clé de licence) |
| `/paramètres` | Bot Manager | Gère tous les paramètres du bot |
| `/profil @membre` | Bot Manager | Affiche le profil complet d'un membre avec actions |
| `/prison @membre` | Bot Manager | Isole un membre dans un salon ticket privé |

### 🎓 Coach

| Commande | Rôle requis | Description |
|----------|-------------|-------------|
| `/conférence` | Coach | Démarre une conférence dans votre salon vocal actuel |
| `/fin-conférence` | Coach | Termine la conférence et distribue les points |

### 👨‍🎓 Élève

| Commande | Rôle requis | Description |
|----------|-------------|-------------|
| `/dashboard` | Tous | Affiche le classement des points en temps réel |
| `/témoignage` | Rôle Élève | Lance le processus de dépôt de témoignage vidéo |

---

## 💎 Système de points

### Sources de points

| Action | Points par défaut | Modifiable |
|--------|-------------------|------------|
| Présence conférence ≥ seuil | 10 pts | `/paramètres` |
| Focus vocal (par 30 min) | 1 pt | `/paramètres` |
| Message envoyé | 1 pt | `/paramètres` |
| Témoignage vidéo validé | 20 pts | `/paramètres` |

### Règles

- Les points **texte** ont un cooldown d'1 minute (anti-spam)
- Les points **focus** s'accumulent par intervalles configurables
- Les points **témoignage** sont d'abord **en attente** jusqu'à validation d'un Bot Manager
- Les salons exclus dans `/paramètres → 🚫 Salons exclus` ne comptent **pas** dans le calcul

### États des points

```
points          → Points validés et disponibles
points_pending  → Points en attente de validation (témoignage)
rewards_blocked → Si 1, aucun point n'est attribué à ce membre
```

---

## 🔄 Intégration n8n

Le bot communique avec n8n via **webhooks sécurisés HMAC SHA-256**.

### Flux témoignage

```
Élève : /témoignage
    │
    ▼
Bot → n8n (N8N_TESTIMONIAL_CREATE_URL)
    Payload: { action, testimonialId, userId, username, guildId }
    ◄ Réponse: { folderUrl, folderId }
    │
    ▼
Bot envoie DM à l'élève avec lien Drive
    │
Élève dépose sa vidéo sur Drive
    │
Élève clique "Vidéo déposée ✅"
    │
    ▼
Bot → n8n (N8N_TESTIMONIAL_CHECK_URL)
    Payload: { action, testimonialId, userId, guildId, driveFolderId }
    ◄ Réponse: { videoFound: true/false }
    │
    ▼
Si vidéo trouvée → points en attente + notif modération
```

### Webhook retour n8n → Bot

Le bot expose un endpoint Express pour recevoir les callbacks :

```
POST http://votre-serveur:3000/webhook/n8n/callback
Header: X-SONE-Signature: <hmac-sha256>

Body (purchase_sync):
{
  "action": "purchase_sync",
  "guildId": "...",
  "userId": "...",
  "data": {
    "product": "Formation X",
    "amount": 297
  }
}
```

### Vérification de signature n8n

Dans votre workflow n8n, avant chaque appel vers le bot, calculez :

```javascript
// Node "Function" dans n8n
const crypto = require('crypto');
const secret = 'VOTRE_N8N_WEBHOOK_SECRET';
const body = JSON.stringify($input.all()[0].json);
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

return [{ json: { ...($input.all()[0].json), signature: sig } }];
```

---

## 📁 Architecture des fichiers

```
sone-bot/
├── index.js                    # Point d'entrée principal + API Express
├── deploy-commands.js          # Enregistrement des slash commands
├── .env.example                # Template de configuration
├── package.json
│
├── commands/
│   ├── setup.js                # /setup — Onboarding + licence
│   ├── parametres.js           # /paramètres — Configuration
│   ├── conference.js           # /conférence + /fin-conférence
│   ├── dashboard.js            # /dashboard + /prison + /profil
│   └── temoignage.js           # /témoignage
│
├── events/
│   ├── ready.js                # Bot prêt
│   ├── interactionCreate.js    # Router central interactions
│   ├── voiceStateUpdate.js     # Tracking vocal (focus + conférence)
│   └── messageCreate.js        # Récompenses messages
│
├── utils/
│   ├── database.js             # Base de données SQLite + helpers
│   ├── dbPatch.js              # Patch schéma (kv_store)
│   ├── embeds.js               # Factory embeds Discord
│   ├── guards.js               # Gardes permissions
│   ├── n8n.js                  # Client webhooks n8n
│   └── focusCron.js            # Cron attribution points focus
│
└── data/
    └── sone.db                 # Base SQLite (auto-générée)
```

---

## 🖥️ Déploiement en production

### Option 1 — PM2 (recommandé)

```bash
npm install -g pm2

# Démarrer
pm2 start index.js --name "sone-bot"

# Démarrage automatique au reboot
pm2 startup
pm2 save

# Logs
pm2 logs sone-bot
```

### Option 2 — Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

```bash
docker build -t sone-bot .
docker run -d \
  --name sone-bot \
  --env-file .env \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  sone-bot
```

### Checklist déploiement

- [ ] `.env` rempli avec toutes les valeurs
- [ ] `node deploy-commands.js` exécuté
- [ ] Port `3000` accessible par n8n (ou reverse proxy configuré)
- [ ] Intents Discord activés dans le Developer Portal
- [ ] Bot invité sur le serveur avec les bonnes permissions
- [ ] `/setup` lancé sur le serveur Discord avec la clé de licence

---

## 🔐 Sécurité

| Mécanisme | Description |
|-----------|-------------|
| Clé de licence | Vérifiée à chaque `/setup`, stockée en DB |
| Signature HMAC | Tous les échanges bot ↔ n8n sont signés |
| Permissions Discord | Chaque commande vérifie le rôle avant exécution |
| Accès Hackend | Certains paramètres (webapp, débans) réservés à l'ID `1223607698113695836` |
| Anti-spam témoignage | 10s entre chaque clic, ban après 10 échecs |
| Ephemeral replies | Les réponses sensibles (profil, paramètres) sont invisibles aux autres |

---

## 📞 Support

**Hackend — Systeme.one**
> Pour toute question relative au bot, contactez l'équipe Hackend.

---

*⚡ Designed by Hackend — Systeme.one*
