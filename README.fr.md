<p align="center">
  <img src="docs/images/fr/banner.svg" alt="Pare-DSH — l'enquête disque par IA de Pare dans DeepSeek Harness" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a> · <b>Français</b> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <img alt="npm" src="https://img.shields.io/npm/v/@drag0nm/pare-dsh?style=flat-square&color=3a3a3a&labelColor=1b1b1b">
  <img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="Pare core" src="https://img.shields.io/badge/Pare%20core-0.4.0-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-3a3a3a?style=flat-square&labelColor=1b1b1b">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3a3a3a?style=flat-square&labelColor=1b1b1b">
</p>

Pare-DSH intègre l'enquête disque par IA de [Pare](https://github.com/DRAG0NM/Pare) dans DeepSeek Harness (DSH). L'agent DSH examine le gaspillage d'espace disque de cette machine avec les outils en lecture seule de Pare, puis prépare un nettoyage. L'analyse, l'enquête et le nettoyage sont réalisés par le cœur Pare, un programme distinct ; le plugin se contente de le lancer, d'enregistrer les outils et de demander l'approbation.

Rien ne change tant que vous n'avez pas approuvé dans l'invite d'approbation propre à DSH, et les fichiers sont déplacés vers une quarantaine réversible au lieu d'être supprimés.

<p align="center">
  <img src="docs/images/en/demo.gif" alt="Une session DSH : analyse, enquête, approbation et rapport de nettoyage" width="100%">
</p>
<p align="center"><sub>Enregistré dans une vraie session DSH, sur un dossier de démonstration. L'interface de DSH n'existe qu'en anglais et en chinois : les captures montrent donc l'interface en anglais.</sub></p>

## Installation

```powershell
dsh plugin --profile web add @drag0nm/pare-dsh
```

Redémarrez le profil (par exemple `dsh web`). Aucune configuration n'est nécessaire. Au premier démarrage, le plugin télécharge le cœur Pare épinglé et le vérifie (voir [Le cœur épinglé](#le-cœur-épinglé)).

## En détail

<table>
  <tr>
    <td width="50%"><img src="docs/images/en/approval.png" alt="Invite d'approbation DSH listant les fichiers exacts"><br><sub><b>Approbation</b> — l'invite liste les fichiers exacts avant tout déplacement.</sub></td>
    <td width="50%"><img src="docs/images/en/result.png" alt="Rapport de l'agent après le nettoyage"><br><sub><b>Résultat</b> — le rapport de l'agent après le nettoyage, avec ce qui a été conservé et pourquoi.</sub></td>
  </tr>
</table>

## Outils

Le plugin lance un processus `pare serve` persistant (protocole `pare.serve/1`, JSON délimité par lignes via l'entrée et la sortie standard) et enregistre les outils suivants. L'index de l'analyse est conservé dans ce processus : lancez donc `pare_scan` avant les outils d'enquête.

| Outil | Rôle | Approbation |
|---|---|:---:|
| `pare_scan` | Analyse en lecture seule d'un lecteur ou d'un dossier ; conserve l'index dans le processus du cœur | Non |
| `pare_scan_overview`, `pare_list_dir`, `pare_find_large_files`, `pare_same_size_files`, `pare_breakdown`, `pare_file_head`, `pare_read_text`, `pare_path_info`, `pare_installed_programs`, `pare_running_processes`, `pare_run_diagnostic` | Outils d'enquête en lecture seule fournis par le cœur. La liste est demandée au cœur au démarrage (`hello`) et suit la version du cœur | Non |
| `pare_read_sensitive` | Lit les fichiers que Pare marque comme sensibles (clés, `.env`, données de connexion du navigateur, magasins d'identifiants) | Oui, à chaque fois |
| `pare_prepare_cleanup` | Enregistre les chemins à mettre en quarantaine et les modèles d'action pris en charge, et renvoie un identifiant de nettoyage. Rien ne change encore | Non |
| `pare_execute` | Exécute un nettoyage préparé, à partir de son identifiant | Oui |
| `pare_list_quarantine` | Liste les lots en quarantaine sur les lecteurs locaux et leur contenu | Non |
| `pare_undo` | Restaure un lot de quarantaine à son emplacement d'origine, sans jamais écraser un fichier qui occupe désormais le chemin d'origine | Oui |
| `pare_purge` | Supprime définitivement un lot de quarantaine pour libérer de l'espace ; irréversible | Oui |

Le plugin n'offre aucune commande shell brute. L'outil bash intégré à DSH a sa propre approbation.

## Approbation et sécurité

Le plugin écoute `tools/pre-execute` de DSH et répond `{kind: 'ask'}` pour `pare_execute`, `pare_undo`, `pare_purge` et `pare_read_sensitive`. DSH vous interroge via son propre service d'approbation. Seul un `allowed-once` à usage unique laisse passer l'appel ; si vous refusez, annulez, ou si personne n'est disponible pour répondre, l'appel est refusé (échec sécurisé). Chaque question est consignée dans le journal d'audit de la session.

- L'invite d'approbation de `pare_execute` est construite à partir du plan enregistré par le plugin et liste les chemins et les commandes de modèle exacts. Elle ne reprend pas la description du modèle d'IA.
- Les identifiants de nettoyage inconnus, expirés ou antérieurs à une nouvelle analyse sont refusés sans poser de question. Un identifiant de nettoyage ne peut être exécuté qu'une seule fois.
- Annuler un appel en cours arrête le processus du cœur ; l'appel suivant en démarre un nouveau, et `pare_scan` doit être relancé.

Le cœur applique ses propres vérifications, indépendamment de l'hôte :

- Les emplacements protégés sont toujours refusés.
- Chaque élément porte des preuves produites par `BuildSelected`.
- Avant de déplacer chaque fichier, l'exécuteur revérifie son identité, s'il a changé et s'il est en cours d'utilisation.
- Les modèles d'action sont validés, le digest de l'aperçu doit correspondre, et un aperçu expire au bout de 30 minutes.
- L'aperçu est marqué comme utilisé avant le début de l'exécution.
- `undo` et `purge` n'acceptent que des manifestes situés dans la quarantaine de Pare.

Confidentialité : les outils d'enquête renvoient chemins et noms de fichiers au modèle (et à son fournisseur). Le contenu des fichiers sensibles exige votre approbation à chaque lecture.

## Le cœur épinglé

L'entrée `pareCore` de `package.json` épingle le cœur utilisé par cette version du plugin : la version 0.4.0, l'URL de téléchargement (l'élément `pare-0.4.0-win-x64.exe` de la version `v0.4.0` de `DRAG0NM/Pare` sur GitHub) et son SHA-256, `23a09ed98b24642e80c1ee83d8a7464e6fa0df2ac1a1d6e078cd5882672001fb`.

Quand ni `parePath` ni `PARE_CORE_PATH` ne sont définis :

- Le plugin utilise `%LOCALAPPDATA%\Pare\core\pare-0.4.0.exe`, stocké par utilisateur en dehors du dossier du plugin, de sorte qu'une réinstallation ou une mise à jour du plugin ne le perd pas. Si le fichier est absent, il est téléchargé depuis l'URL épinglée : d'abord avec `curl.exe` de System32 (qui respecte `HTTPS_PROXY`), puis, en cas d'échec, avec `Invoke-WebRequest` de PowerShell (qui utilise le proxy système de Windows).
- Le SHA-256 est vérifié après le téléchargement. Le fichier n'est conservé que s'il correspond ; un téléchargement qui ne correspond pas est supprimé.
- Le hachage est de nouveau vérifié à chaque démarrage et avant chaque lancement du processus du cœur. Si le fichier a été modifié, le plugin refuse de s'exécuter (il ne le remplace jamais automatiquement) et le message d'erreur indique de supprimer le fichier pour qu'il soit retéléchargé.
- La version renvoyée par `hello` doit être égale à la version épinglée ; sinon le plugin la refuse et n'enregistre aucun outil d'enquête.
- Sur certaines machines, `AppData\Local` est chiffré par EFS et un renommage dans le même dossier est rejeté (EXDEV), ou bien un antivirus retient brièvement le fichier. Le plugin réessaie pendant quelques secondes, puis se rabat sur une copie suivie de la suppression du fichier temporaire ; le fichier final doit passer la même vérification de hachage.

En développement, faites pointer `parePath` (option du plugin) ou la variable d'environnement `PARE_CORE_PATH` vers votre propre `pare.exe` (`go build -o pare.exe ./cmd/pare`). Aucune vérification de hachage n'est alors faite ; seul le nom du protocole est contrôlé.

Pour les machines hors ligne, placez le même fichier (SHA-256 identique) dans `%LOCALAPPDATA%\Pare\core\pare-0.4.0.exe`, ou définissez `parePath`.

`timeoutMs` est le délai d'expiration par appel, 600000 ms par défaut.

## Prérequis

- Windows.
- DeepSeek Harness `0.2.1-rc.2` (Cordis `4.0.5`). Harness est encore une préversion pour développeurs et ses interfaces peuvent changer de façon incompatible ; Pare-DSH épingle la version de la dépendance peer sur l'interface d'outils avec laquelle il a été vérifié, il faut donc retester avant toute mise à niveau.
- Node.js 22.19 ou plus récent (exigence de DSH lui-même).
- Un accès à GitHub au premier démarrage, pour télécharger le cœur épinglé.

## Compiler depuis les sources

```powershell
pnpm install
pnpm check
dsh plugin --profile web add .
```

Vérifié de bout en bout dans DSH 0.2.1-rc.2, y compris le refus, l'autorisation, l'annulation et la purge, ainsi que l'installation depuis npm.

## Licence

MIT, voir [LICENSE](LICENSE). Les notes sur les dépendances se trouvent dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Le cœur est [Pare](https://github.com/DRAG0NM/Pare), également sous licence MIT.

## Ressources officielles de DSH

- [Official Harness repository and release status](https://github.com/deepseek-ai/deepseek-harness)
- [Official first-plugin guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)
- [Official tool authoring guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [Official plugin packaging guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
