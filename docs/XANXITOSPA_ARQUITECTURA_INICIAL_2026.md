# XanxitoSpA — Arquitectura inicial canónica

**Fecha:** 21 de agosto de 2026  
**Estado:** arquitectura inicial cerrada — revisión evolutiva incorporada  
**Versión arquitectónica:** 1.1  
**Fase:** ready-for-runtime / documentación fundacional re-cerrada tras evidencia nueva

---

## 0. Propósito

XanxitoSpA es un **harness empresarial genérico**: una base capaz de formar, organizar y operar empresas autónomas de distintos rubros sin programar una empresa específica dentro del kernel.

La meta no es construir “una IA para Plasticov”, una empresa de software, una agencia o un ecommerce. La meta es programar la **capacidad de formar y operar empresas**.

La fórmula conceptual es:

```text
Disciplina operacional de Xanxittoo
+ investigación e invariantes empresariales de IO
+ mejores patrones observados en Company OS modernos
- ceremonia de desarrollo dentro del producto
- enjambres de agentes innecesarios
= XanxitoSpA
```

IO queda como investigación, laboratorio y biblioteca de invariantes. Xanxittoo demuestra el estilo de harness que funciona. XanxitoSpA adopta esas lecciones en un producto empresarial separado.

---

# 1. Leyes principales

## 1.1 Model Law

**`PrincipalPolicy` V1 fija explícitamente GPT-5.6 Sol como único modelo cognitivo del sistema.** Executive usa `max`; supervisores, workers, critics, verifiers y ramas `COMPETE` usan el mismo Sol en `xhigh`. No existe model fallback, secondary model provider ni provider-managed multi-agent. XanxitoSpA conserva el Mission Graph y la bifurcación como propiedad del kernel.

GPT razona, dirige, delega, consolida, decide dentro de su autoridad, recupera memoria, ejecuta preflights y produce decisiones estructuradas.

V1 no incorpora otros modelos cognitivos/generativos como workers ni como rutas alternativas. La misma familia GPT ejecuta razonamiento y decide cuándo usar tools.

```text
GPT-5.6 Sol / max
= Executive reasoning / authority / consolidation

GPT-5.6 Sol / xhigh
= supervisors / workers / critics / verifiers / COMPETE branches

Responses image_generation
= rendering tool selected by GPT; current OpenAI backend GPT Image 2

email / database / CAD / hosting / MCP / etc.
= business tools, not cognitive models
```

Cambiar o introducir otro model provider requiere una nueva decisión constitucional/evaluada; no es routing normal del Capability Plane.

## 1.2 Kernel pequeño

Las capacidades externas no deben inflar el kernel. El núcleo conoce contratos semánticos y un Capability Router; **los proveedores de capabilities** son reemplazables. El principal cognitivo pertenece a `PrincipalPolicy`, fuera de ese router.

## 1.3 Empresa genérica

El kernel no conoce Plasticov, SaaS, construcción, retail, consultoría ni otro rubro como caso especial. La empresa concreta se define mediante Company Manifest, procesos, departamentos, memoria, datos, capabilities y políticas.

## 1.4 Work no concede autoridad

`Work` describe qué hay que hacer. `Delegation` describe qué está permitido hacer.

Asignar trabajo no concede acceso, presupuesto, capacidad de aprobar, gastar, publicar, borrar o ejecutar acciones externas.

## 1.5 Autoridad deny-by-default

Si una acción material no tiene autorización explícita, vigente y adecuada al riesgo, se niega o escala.

## 1.6 Evidencia proporcional al riesgo

La empresa no necesita burocracia igual para cada acción. A mayor impacto, irreversibilidad o dinero involucrado, mayor independencia de revisión/verificación/aprobación.

## 1.7 Browser como excepción

Orden preferido de ejecución externa:

```text
MCP / API
   ↓ si no existe
CLI / SSH
   ↓ si no existe
Browser automation
   ↓ sólo cuando sea necesario
Human interactive browser
```

El navegador se reserva principalmente para bootstrap, MFA, KYC, captcha, login inicial, contratos o servicios sin API razonable.

## 1.8 El silencio no cuesta tokens

La empresa puede estar disponible 24/7 sin mantener modelos razonando permanentemente.

```text
evento/timer
→ filtro determinístico
→ ¿novedad material?
   no → heartbeat sin LLM
   sí → despertar organización necesaria
```

## 1.9 Hechos, memoria y procesos son cosas distintas

```text
DATABASE       = hechos operacionales actuales
EVENT LEDGER   = qué ocurrió
MEMORY         = qué aprendimos/sabemos
PROCESS        = cómo actuamos ante una situación
SKILL          = cómo resolver una clase de problema
```

Nunca usar “memoria del LLM” como sistema operacional de la empresa.

## 1.10 Constitución antes que optimización

XanxitoSpA no maximiza una métrica aislada “por sobre todas las cosas”. Toda optimización ocurre dentro de una jerarquía constitucional.

```text
Founder / Board Constitution
        ↓
legalidad + acciones humanas reservadas
        ↓
solvencia + seguridad + obligaciones contractuales
        ↓
propósito + promesas al cliente + límites de riesgo
        ↓
objetivos y KPIs de la Company
        ↓
valor empresarial sostenible / rentabilidad
        ↓
eficiencia de costo, tiempo y compute
```

Una estrategia que aumenta utilidad inmediata violando una restricción superior no es una estrategia válida.

## 1.11 Competencia de ideas; cooperación en ejecución

La empresa puede hacer competir hipótesis, procesos, skills o estrategias. Los departamentos no compiten por poder ni por “ganar” discusiones.

Una vez que el owner responsable decide, la organización coopera en la ejecución de la decisión mientras permanezca dentro de Constitución, autoridad y presupuesto.

---

# 2. Arquitectura conceptual

```text
                         FOUNDER / BOARD
                                │
                         Constitution
                                │
                                ▼
                     EXECUTIVE SUPERVISOR
                                │
                        Business Preflight
                                │
                     Mission / Decision / Competition Graph
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼
  Commercial                Finance                Operations
  Supervisor                Supervisor             Supervisor
        │                       │                        │
  Dept Memory               Dept Memory             Dept Memory
        │                       │                        │
  Dept Preflight            Dept Preflight          Dept Preflight
        │                       │                        │
    workers                 workers                  workers
        │                       │                        │
        └────────────── Capability Router ──────────────┘
                                │
                 MCP / API / CLI / SSH / Browser
                                │
                                ▼
                           REAL WORLD
                                │
                                ▼
                        Business Outcomes
                                │
                    Events / KPI / Receipts
                                │
                      Fitness / Evolution
                                │
                    Learning / Memory / Genes
```

---

# 3. Organización genérica

## 3.1 Permanentes iniciales

XanxitoSpA parte con una organización mínima. Los nombres pueden evolucionar, pero las funciones empresariales universales deben estar cubiertas.

Base recomendada:

- Executive / General Supervisor
- Commercial / Revenue Supervisor
- Finance Supervisor
- Operations Supervisor
- Customer Supervisor
- Administration & Risk Supervisor

## 3.2 Departamentos opcionales

Se habilitan según la empresa:

- Product
- Technology / Engineering
- People / HR
- Supply Chain
- Legal / Compliance
- Research
- Creative / Brand
- Security
- Infrastructure
- otros que la presión real de negocio justifique

## 3.3 Workers dinámicos

Los supervisores son relativamente estables. Los workers especializados son temporales.

```text
problema
→ supervisor
→ crea/instancia worker especializado
→ entrega contexto + Work + grants
→ worker ejecuta
→ devuelve evidencia/outcome
→ grants expiran
→ worker desaparece
```

No acumular cientos de agentes permanentes.

## 3.4 Promoción de roles permanentes

Si un tipo de worker aparece repetidamente y existe evidencia de demanda/costo/beneficio, el sistema puede proponer convertir esa función en rol o departamento estable.

---

# 4. Business Preflight

El equivalente empresarial de la disciplina previa de Xanxittoo será `business_preflight`.

Debe responder, según el nivel:

- cuál es el objetivo;
- qué disparó el trabajo;
- qué estado empresarial importa;
- impacto esperado;
- riesgo;
- autoridad disponible;
- presupuesto;
- dependencias;
- departamentos necesarios;
- qué puede ejecutarse en paralelo;
- si conviene ejecutar directo, dividir, colaborar, desafiar, debatir o **competir alternativas**;
- qué proceso existente aplica;
- qué skills/capabilities se necesitan;
- qué evidencia permitirá declarar éxito;
- condición terminal;
- condición de escalación/rollback.

El preflight existe en tres niveles:

### Executive Preflight

Determina dimensión empresarial, prioridad, departamentos, riesgo, presupuesto y ownership.

### Department Preflight

Determina la parte del problema que corresponde al departamento, proceso, workers, skills y capabilities.

### Worker Preflight

Determina acción concreta, herramientas, límites, outputs, evidencia y condición de finalización.

La lógica es recursiva; no se construyen tres orquestadores distintos.

---

# 5. Mission Graph y bifurcación

XanxitoSpA no debe limitarse a un árbol rígido. El trabajo se expresa como un grafo pequeño usando primitivas universales.

## 5.1 Primitivas

### FAN-OUT

Una responsabilidad se divide en N ramas independientes y luego se consolida.

```text
1 → N → 1
```

### HANDOFF

Un actor entrega una responsabilidad estructurada a otro.

```text
A → B
```

### JOIN

Dos o más resultados/dependencias deben estar completos antes de continuar.

### COLLABORATE

Dos departamentos o workers intercambian información estructurada para producir un resultado conjunto.

```text
A ↔ B → Joint Result
```

### CHALLENGE

Una decisión recibe una crítica independiente de una sola pasada antes de ejecutarse.

```text
decision → critic → material finding? → execute/revise
```

### DEBATE

Dos posiciones deliberadamente diferentes confrontan una decisión compleja. Una ronda es el default; una segunda ronda sólo se habilita cuando el riesgo o la ambigüedad lo justifican. Nunca se supera un máximo estricto de dos rondas.

### COMPETE

Dos o más workers reciben **la misma tarea y el mismo snapshot de evidencia**, pero strategy overlays deliberadamente distintos. Primero trabajan ciegos entre sí; después pueden hacer una crítica cruzada acotada y el owner/supervisor adjudica.

```text
                 TASK X
                   │
            same evidence
                   │
          ┌────────┴────────┐
          ▼                 ▼
      Worker A          Worker B
     Strategy A        Strategy B
        BLIND             BLIND
          │                 │
          └────────┬────────┘
                   ▼
             cross-critique
               1 round
                   │
                   ▼
             decision owner
           ┌───────┼───────┐
           ▼       ▼       ▼
           A       B   synthesis C
```

Reglas V1:

- dos candidatos es el default;
- más de dos requiere valor esperado suficiente y presupuesto;
- los candidatos no ven la respuesta del otro antes de fijar su primera posición;
- la diversidad proviene de skills/strategy overlays, no de cambiar el principal cognitivo;
- no existe votación mayoritaria como mecanismo de autoridad;
- si el resultado puede probarse reversiblemente, se puede ejecutar A/B; si no, sólo se ejecuta la opción adjudicada;
- cada rama produce evidencia comparable y costo medible.

### REDUCE

Un supervisor consolida múltiples resultados en una sola posición/decisión departamental.

## 5.2 Límites de fan-out

El objetivo es paralelismo útil, no explosión de agentes.

Punto de partida conceptual:

```text
Executive:   max 4 ramas/departamentos simultáneos
Department:  max 4 workers simultáneos
Worker:      max 2 operaciones I/O independientes
```

Workers normalmente no crean subworkers. Si necesitan otra especialidad, lo solicitan a su supervisor.

Estos números son configuración/política, no una ley matemática permanente.

---

# 6. Colaboración interdepartamental

Los departamentos pueden colaborar sin escalar todo al Executive.

No usar chat libre como fuente autoritativa. La colaboración viaja en objetos estructurados.

Ejemplo conceptual:

```yaml
collaboration:
  requester: commercial
  responder: operations
  question: "¿Podemos soportar una promoción del producto X?"
  context:
    expected_demand: "+40%"
  requested_output:
    - inventory_capacity
    - shipping_capacity
    - constraints
  deadline: 15m
```

El resultado puede producir un `Joint Work`.

Si existe desacuerdo material, se activa `challenge` o `debate` según el riesgo.

---

# 7. Debate acotado

El debate no es una conversación infinita. Es un protocolo.

## 7.1 Roles de reasoning

Los roles no son empleados permanentes. Son skills/formas temporales de razonar.

### Advocate

Busca upside, evidencia favorable, oportunidad, viabilidad y mitigaciones.

### Critic

Busca supuestos débiles, riesgos, datos faltantes, costo, efectos secundarios y escenarios de fracaso.

### Verifier (opcional)

No toma postura; verifica qué afirmaciones están realmente respaldadas por evidencia. Se usa sólo cuando el riesgo lo justifica.

## 7.2 Una ronda por defecto; dos como máximo

```text
ROUND 1 — default
Advocate → posición
Critic   → posición

¿persiste ambigüedad material y el valor esperado justifica otra ronda?
   no → STOP / owner decide
   sí → ROUND 2

ROUND 2 — máximo
Advocate → responde objeciones
Critic   → responde defensa

STOP
```

Más conversación no se considera más inteligencia. El protocolo evita conformidad, deriva del problema y consumo inútil de tokens.

## 7.3 Ownership de decisión

No hay votación por mayoría de agentes.

La decisión pertenece a un principal explícito:

- pricing → Commercial Supervisor;
- presupuesto → Finance Supervisor;
- logística → Operations Supervisor;
- transversal → Executive;
- fuera de autoridad → Founder/Board.

Los participantes asesoran. El owner decide.

## 7.4 Escalación por desacuerdo

```text
1 ronda por defecto / máximo 2
→ acuerdo: ejecutar dentro de autoridad
→ desacuerdo: decide process owner/supervisor
→ sin autoridad o transversal: Executive
→ reservado/crítico: Founder/Board
```

---

# 8. Memoria empresarial

## 8.1 Company Memory

Contiene conocimiento corporativo transversal:

- propósito;
- estrategia;
- objetivos;
- políticas;
- estructura;
- KPIs;
- decisiones;
- riesgos;
- activos;
- convenciones institucionales.

## 8.2 Department Memory

Conocimiento especializado y acotado por función.

Ejemplo Commercial:

- clientes;
- pricing;
- campañas;
- competidores;
- conversiones;
- procesos;
- estrategias comprobadas.

## 8.3 Supervisor Memory

Más operacional:

- pendientes;
- workers/procesos que han funcionado;
- delegaciones activas;
- errores repetidos;
- decisiones recientes;
- scorecards.

## 8.4 Worker Memory

Principalmente efímera. El worker recibe sólo el contexto necesario para su Work.

El conocimiento útil no se conserva porque “el agente lo recuerde”; se promueve explícitamente hacia memoria departamental, proceso o skill.

## 8.5 Cross-department memory

Un departamento no escribe directamente en las creencias internas de otro.

El intercambio transversal ocurre mediante hechos/eventos/decisiones verificables.

```text
Commercial Memory
→ verified BusinessEvent
→ Company Event Ledger
→ Operations consumes event
```

---

# 9. Learning y evolución corporativa

La **promoción** institucional se activa únicamente por outcomes observables, verificados y comparables; para explicar por qué una variante ganó o falló, el learning puede consultar `ExecutionTraceSummary` sanitizadas y scoped. Scores o trazas por sí solos no autorizan promoción, y jamás se persisten secretos ni conversaciones crudas como conocimiento institucional.

```text
operación
→ outcome verificado
→ ¿aprendizaje durable?
   no → no persistir ruido
   sí → Learning Candidate
→ acumular evidencia
→ evaluar
→ promover / mantener como challenger / silenciar / rechazar
→ Memory / Process / Skill / Corporate Gene
```

## 9.1 Corporate Genes

Un `CorporateGene` es una variante versionada de una forma de operar. **No es un agente ni un modelo.**

Tipos V1:

```text
StrategyGene
ProcessGene
SkillGene
TeamCompositionGene
ProviderRoutingGene
```

Contrato conceptual:

```yaml
gene:
  id: sales-followup-v7
  type: process
  lineage:
    parents: [sales-followup-v5, sales-followup-v6]
  context_signature: ...
  artifact_ref: ...
  status: challenger

fitness:
  outcome_dimensions: ...
  sample_size: ...
  confidence: ...
  cost: ...
  risk_incidents: ...
```

La empresa desarrolla así un ADN organizacional auditable: lo que evoluciona son procesos, skills, estrategias, composiciones y routing, no la autoridad constitucional. El modelo principal tampoco muta mediante Corporate Evolution; sólo puede cambiar mediante una revisión explícita de `PrincipalPolicy`.

## 9.2 Fitness multiobjetivo y Pareto

No existe una única fórmula universal de fitness. Primero se aplican las restricciones constitucionales; después se comparan outcomes según los objetivos y KPIs relevantes de la Company.

Dimensiones típicas:

- resultado económico/contribution profit cuando aplique;
- calidad;
- confiabilidad;
- velocidad;
- costo LLM/compute;
- costo de herramientas/proveedores;
- riesgo e incidentes;
- satisfacción/retención/obligaciones al cliente;
- intervención humana requerida;
- reversibilidad;
- cumplimiento de objetivos del proceso.

La selección usa una **frontera de Pareto** y floors de seguridad/calidad antes de cualquier score agregado. Una variante más cara puede seguir siendo champion si aporta calidad/riesgo que otra no alcanza; una variante apenas inferior pero muchísimo más barata puede ser preferible en otro contexto.

No promover por una muestra pequeña. La evaluación considera `sample_size`, confianza, similitud de contexto y calidad de evidencia.

## 9.3 Estados evolutivos

```text
candidate
challenger
champion
silent
quarantine
retired
```

- `candidate`: variante nueva aún no probada;
- `challenger`: compite contra un baseline/champion;
- `champion`: variante preferida para un contexto determinado;
- `silent`: perdió bajo cierto contexto, se conserva pero no se usa normalmente;
- `quarantine`: evidencia insuficiente, anomalía o riesgo;
- `retired`: retirada explícitamente por obsolescencia/política.

No borrar perdedores automáticamente. Se preserva `negative-result lineage` para no repetir hipótesis fallidas sin explicar qué cambió.

## 9.4 Corporate Evolution Cycle

El ciclo no depende de una “noche de evolución” fija. Se activa cuando existe evidencia suficiente o un evento material.

```text
collect verified outcomes
→ evaluate context + fitness
→ update Pareto frontier
→ preserve champions
→ silence/prune dominated variants
→ create challengers by mutation/crossover/fresh exploration
→ COMPETE / pilot / A-B when safe
→ verify real outcome
→ promote / revert / retain negative result
→ institutionalize
```

Puede dispararse al terminar un experimento, alcanzar tamaño de muestra, degradarse un KPI, cambiar materialmente el entorno o mediante revisión periódica. El heartbeat sigue sin invocar GPT si no existe novedad material.

## 9.5 Mutación y exploración con límites

La evolución puede proponer:

- cambio de instrucciones/strategy overlay;
- nueva versión declarativa de Skill;
- nueva versión de Process;
- distinta composición temporal de workers;
- distinto routing entre providers elegibles.

No puede por sí sola:

- modificar Constitución;
- ampliar autoridad;
- crear presupuesto nuevo;
- rebajar hard filters de compliance/privacy;
- convertir código arbitrario externo en capability confiable;
- saltarse aprobación humana reservada.

Siempre se conserva capacidad de exploración para evitar monocultura. La proporción champion/challenger es política calibrable por Company Gym y presupuesto, no una constante universal.

## 9.6 Qué se promueve a memoria

Guardar principalmente:

- decisiones durables;
- invariantes;
- procesos efectivos;
- errores reproducibles;
- resultados negativos útiles;
- estrategias comprobadas;
- skills comprobadas;
- contexto donde un Corporate Gene gana o pierde.

Evitar guardar conversaciones completas como “conocimiento”. El trabajo de IO sobre Skill Outcome + Learning Candidate + Promotion y las lecciones de Kiiess sobre deliberación/evidencia son referencias conceptuales, no dependencias.

---

# 10. Process, Skill y Capability

Esta separación es una ley de diseño.

```text
PROCESS
= cuándo y por qué hacemos algo

SKILL
= cómo pensar/resolver una clase de problema

CAPABILITY
= con qué herramienta actuamos en el mundo
```

Ejemplo:

```text
Process: recuperar ventas
Skill:   analizar pricing
Capability: commerce.read / ads.read / pricing.write
```

Una skill nunca debe quedar acoplada a un proveedor concreto si existe un contrato semántico mejor.

---

# 11. Process Object

Los procesos empresariales reemplazan la ceremonia SDD/TDD/RDD dentro del producto, conservando sus principios útiles.

Un Process versionado puede contener:

```yaml
process:
  id: pricing_recovery
  version: 4
  trigger: ...
  objective: ...
  inputs: ...
  owner: commercial
  authority: ...
  forbidden: ...
  budget: ...
  actions: ...
  success: ...
  verification: ...
  rollback: ...
  escalation: ...
  learning: ...
```

## 11.1 SDD transformado en proceso empresarial

```text
observar/investigar
→ proponer decisión
→ definir resultado y límites
→ diseñar proceso
→ crear Work/delegaciones
→ ejecutar
→ medir outcome
→ institucionalizar proceso
```

Sólo se usa cuando existe ambigüedad durable o un proceso nuevo. Un caso rutinario ejecuta el proceso vigente directamente.

## 11.2 TDD transformado en experimento empresarial

```text
baseline
→ resultado esperado
→ acción pequeña/reversible
→ medir
→ escalar / revertir / aprender
```

## 11.3 RDD transformado en Business Receipt

Cada acción material puede registrar:

- qué se hizo;
- por qué;
- proponente;
- autoridad;
- ejecutor;
- costo;
- evidencia;
- verificador;
- outcome;
- KPI afectado;
- aprendizaje.

---

# 12. Kit universal de empresa

XanxitoSpA debe ser capaz de aprovisionar o conectar las herramientas mínimas de una empresa real.

## 12.1 Identity

- Company
- departamentos
- roles
- principals
- grants
- activos

## 12.2 Communication

- email
- phone
- messaging
- notifications
- calendar
- meetings/deadlines

## 12.3 Information

- databases
- documents
- files/object storage
- search
- analytics
- knowledge/memory

## 12.4 Money

- budgets
- cards/payment instruments
- payments
- invoices/accounting interfaces
- cost tracking

## 12.5 Work

- objectives
- projects
- Work
- Delegation
- dependencies
- processes
- skills
- handoffs

## 12.6 External Action

- MCP
- APIs
- webhooks
- CLI
- SSH
- browser fallback

## 12.7 Creative/Digital

- images
- video
- audio/voice cuando corresponda
- vector/brand assets
- 3D
- CAD/BIM
- documents
- presentations
- web/digital assets

---

# 13. Capability Router

El kernel habla en capacidades semánticas, no en nombres de proveedores.

Ejemplo:

```text
email.send
calendar.create
phone.acquire
payment.authorize
data.query
image.generate
video.generate
model3d.generate
cad.modify
```

Luego el router resuelve el proveedor disponible y autorizado.

## 13.1 Prioridad de integración

```text
1. MCP / API
2. CLI / SSH
3. Browser automation
4. Browser interactivo/humano
```

## 13.2 Secretos

Workers no reciben secretos brutos cuando puede entregarse un capability handle.

```text
NO:
TWILIO_AUTH_TOKEN
DATABASE_ROOT_PASSWORD
CARD_SECRET

SÍ:
phone.send_sms(...)
data.query(...)
payment.request(...)
```

---

# 14. Company Bootstrap

Una skill/proceso fundamental será `company-bootstrap`.

Objetivo:

```text
entender empresa
→ detectar infraestructura necesaria
→ comparar proveedores
→ proponer stack
→ solicitar sólo aprobaciones necesarias
→ aprovisionar
→ verificar
→ registrar activos
```

Puede incluir:

- dominio;
- correo;
- aliases/grupos;
- teléfono;
- calendarios;
- storage;
- bases de datos;
- repositorios;
- hosting;
- CRM/commerce según negocio;
- billing;
- instrumentos de pago;
- budgets;
- skills iniciales;
- memoria inicial;
- departamentos.

KYC, aceptación contractual, identidad legal, nuevas líneas de crédito, aumentos de autoridad financiera y acciones irreversibles escalan al humano cuando corresponda.

## 14.1 Empresa nueva vs empresa existente

`company-bootstrap` tiene dos rutas de entrada.

### NEW COMPANY

```text
purpose + founder constraints
→ market/competition discovery
→ competing business theses
→ unit economics + feasibility
→ minimum departments/processes
→ provision identity/tools/data
→ pilot launch
→ outcomes
→ operate / improve / grow
```

### EXISTING COMPANY

```text
discover current systems/assets/processes
→ reconstruct business model + ownership + KPIs
→ map existing departments and sources of truth
→ establish baselines
→ identify gaps without replacing what works
→ Company Manifest + grants + adapters
→ observe first
→ progressively improve
```

XanxitoSpA adopta y modela una empresa existente antes de reorganizarla. No impone seis departamentos físicos si las mismas funciones ya están cubiertas de otra forma.

## 14.2 Business Unit Spawning

Una oportunidad suficientemente material puede generar una nueva unidad de negocio sin necesitar un kernel nuevo.

```text
opportunity signal
→ market + competition evidence
→ COMPETE business theses
→ Finance + Commercial + Operations feasibility
→ Executive adjudication
→ bounded pilot
→ verified outcome
→ scale / mutate / stop
→ optional business unit bootstrap
```

Una `BusinessUnit` puede ser una división lógica, nueva marca, canal, país, producto o línea de negocio. Crear una **nueva persona jurídica**, abrir deuda/capital o firmar obligaciones reservadas continúa siendo Founder/Board/human boundary.

---

# 15. Company Asset Registry

Las cuentas pertenecen a Company, no al agente que las creó.

```text
COMPANY owns ACCOUNT / DATABASE / DOMAIN / PHONE / CARD / REPO
ROLE receives ACCESS GRANT
WORKER receives TEMPORARY GRANT
```

Cuando el worker desaparece, expira su acceso; el activo continúa siendo de la empresa.

El registry debe poder representar:

- propietario;
- provider;
- capability;
- departamento responsable;
- credenciales referenciadas indirectamente;
- costo;
- estado;
- renovación;
- grants;
- restricciones;
- dependencia de KYC/humano.

---

# 16. Presupuestos e instrumentos de pago

No pedir aprobación humana por cada gasto autorizado. Usar envelopes/políticas.

Ejemplo conceptual:

```yaml
marketing:
  monthly_budget: ...
  autonomous:
    per_transaction: ...
    daily: ...
  allowed_categories: ...
  denied_categories: ...
  escalation_threshold: ...
```

Una compra dentro de presupuesto, categoría y autoridad puede ser autónoma. Una compra fuera de límites escala o se niega.

Los instrumentos pueden asignarse por departamento, pero siempre pertenecen a Company.

---

# 17. Data Plane

El Data Plane es una capacidad universal de XanxitoSpA.

La empresa no queda forzada a una sola tecnología. Debe poder descubrir, crear, conectar, gobernar y evolucionar almacenamiento según necesidad.

## 17.1 Clases de almacenamiento

- SQL operacional;
- analytics/warehouse;
- documentos;
- búsqueda/vectorial;
- object storage/files;
- caches cuando sea necesario.

## 17.2 Capabilities base

```text
data.discover
data.query
data.write
data.provision
data.schema
data.migrate
data.backup
data.restore
data.health
```

## 17.3 Ownership por dominio

Un mismo motor físico puede alojar múltiples dominios, pero ownership y acceso son explícitos.

Ejemplo:

```text
Commercial: customers / leads / sales
Finance:    costs / invoices / cash
Operations: inventory / suppliers / logistics
Customer:   tickets / satisfaction
```

Un departamento no modifica arbitrariamente datos autoritativos de otro.

## 17.4 Grants temporales

```text
Company owns database
Department owns domain
Supervisor receives scoped grant
Worker receives temporary command-bound grant
```

## 17.5 Backup como función empresarial

Provisionar una DB implica también:

```text
database
→ backup policy
→ retention
→ restore capability
→ restore test
→ monitoring
→ owner
```

“Backup activado” no es suficiente si no puede demostrarse restaurabilidad.

## 17.6 Riesgo de operaciones de datos

Ejemplos conceptuales:

- lectura: bajo;
- write acotado: bajo/medio;
- bulk mutation: medio;
- migration: medio/alto;
- destructive schema change: alto;
- database destroy: crítico.

El mismo motor de preflight/autoridad/evidencia gobierna datos; no se crea un framework separado.

---

# 18. Creative Plane

La creatividad/diseño es una capacidad empresarial de primera clase.

**El `PrincipalPolicy` V1 sigue fijando GPT-5.6 Sol como cerebro.** Los modelos creativos son tools/capability providers y no comparten autoridad ejecutiva.

## 18.1 Capabilities semánticas

```text
brand.create
image.generate
image.edit
vector.generate
mockup.generate
video.generate
video.edit
video.extend
video.reference
model3d.generate
model3d.texture
model3d.rig
model3d.printable
cad.generate
cad.modify
bim.generate
document.compose
presentation.compose
```

## 18.2 One Model Law creativo — V1

La decisión vigente desde V0.6 simplifica el plano cognitivo/generativo:

```text
Executive owner           → gpt-5.6-sol / max
Creative Supervisor       → gpt-5.6-sol / xhigh
Creative Worker           → gpt-5.6-sol / xhigh
COMPETE candidate A/B     → gpt-5.6-sol / xhigh
Critic / verifier         → gpt-5.6-sol / xhigh
secondary model provider  → forbidden
provider-managed agents   → forbidden
```

La diversidad de `COMPETE` viene de strategy overlays, no de mezclar modelos. XanxitoSpA mantiene ownership de FAN-OUT/COMPETE/Mission Graph. La beta Multi-agent del proveedor no es parte del runtime V1.

## 18.3 Imagen, video y renderers

Según documentación oficial verificada al **21-08-2026**:

- `gpt-5.6-sol` soporta la herramienta built-in `image_generation` dentro de Responses API;
- el backend especializado de imagen vigente de OpenAI es GPT Image 2;
- GPT Image 2 es renderer/tool, no principal cognitivo;
- `gpt-5.6-sol` no produce video directamente;
- los endpoints de video vigentes documentan Sora 2 / Sora 2 Pro como Legacy/Deprecated.

Por tanto el routing V1 es:

```text
image.generate/edit      → Sol decide → Responses image_generation
vector/logo/diagram      → Sol → SVG/code determinista → renderer
document/presentation    → Sol → estructura/código → renderer determinista
video brief/storyboard   → Sol → script/shot list/keyframes
video final render       → STAGED / unavailable fail-closed
CAD/3D engine            → tool empresarial aprobado, no segundo modelo cognitivo
```

No se mantienen Gemini, xAI, Runway, Recraft, Meshy, Tripo u otros modelos generativos como defaults activos V1. Pueden conservarse como investigación histórica, pero activarlos exigiría una nueva decisión constitucional/evaluación y no un simple cambio de ProviderRegistry.

## 18.4 CAD/BIM no es 3D creativo

```text
3D creativo / marketing / concepto
→ Sol genera brief/spec/procedural asset; renderer/engine aprobado ejecuta si existe

CAD / BIM / plano técnico / fabricación
→ capability técnico verificado (CAD/BIM engine), no segundo modelo cognitivo
```

Un modelo visual generativo no debe presentarse como plano técnico certificado.

## 18.5 Documentos empresariales

Para PDF/PPTX/DOCX y piezas estructuradas:

```text
GPT crea contenido/estructura
→ renderer determinista compone documento
→ Creative Plane aporta imágenes/renders/assets
```

No depender de un modelo generativo de imagen para construir documentos autoritativos.

---

## 18.6 Creative execution is internal, not chat rendering

La generación creativa ocurre detrás del runtime de la empresa. Chat/control surfaces sólo crean o consultan `CreativeMission`; no son la superficie de render.

```text
chat intent
→ durable creative.mission job
→ Creative Supervisor (Sol/xhigh)
→ blind concept COMPETE (Sol/xhigh)
→ native image_generation jobs (bounded parallelism)
→ internal CompanyAsset candidates
→ VisualFitness evaluators (Sol/xhigh)
→ Creative Supervisor decision
→ selected asset / decision receipt
```

Los candidatos se etiquetan `internal-candidate` y `not-chat-visible`. Sólo el asset seleccionado y una razón resumida se exponen por defecto. Executive Sol/max entra únicamente por autoridad/riesgo o insuficiencia de candidatos válidos.


# 19. Bifurcación creativa

Una misión creativa puede usar el mismo Mission Graph:

```text
Creative request
      │
      ▼
Brief worker
Research/context worker
      │
      ▼
Concept fan-out (2–4)
      │
      ▼
Challenge / Debate
      │
      ▼
Creative Supervisor decides
      │
      ▼
Render capability
      │
      ▼
Packaging / publishing
```

El proveedor creativo produce assets. GPT conserva planificación, crítica, decisión, contexto de marca y verificación.

---

# 20. Herramientas de comunicación

## 20.1 Email

Email es infraestructura fundamental y principalmente interfaz con el mundo externo.

Capacidades esperadas:

```text
email.read
email.search
email.send
email.reply
email.forward
email.create_alias
email.create_mailbox
email.create_group
```

Departamentos pueden tener aliases/shared inboxes sin requerir necesariamente usuarios pagos independientes.

## 20.2 Phone

Capability genérico:

```text
phone.search_number
phone.acquire
phone.release
phone.receive_sms
phone.send_sms
phone.receive_call
phone.route_call
```

La obtención de número puede requerir documentación/regulación según país; esas fronteras escalan.

## 20.3 Comunicación interna

Los agentes no deben usar correo/chat libre como fuente autoritativa interna. Internamente usan Work, Handoff, Collaboration, Decision, Event, Receipt y Memory.

---

# 21. Company Lifecycle y operación 24/7

## 21.1 Operating modes

El mismo kernel debe saber formar una empresa, operar una existente y acompañar su evolución. Los modos describen doctrina/prioridad de una Company o misión; no obligan a que toda la organización esté en un único estado exclusivo.

```text
BOOTSTRAP  → formar/adoptar la empresa y establecer fuentes de verdad
OPERATE    → ejecutar procesos normales y cumplir compromisos
IMPROVE    → reducir errores/costo y elevar outcomes de procesos existentes
GROW       → escalar productos/canales/capacidad ya validados
EXPAND     → nuevos mercados, productos, países o business units
RECOVER    → incidente, caída de KPIs, caja/riesgo o degradación material
EXIT       → cerrar, vender, migrar o retirar una unidad/proceso de forma controlada
```

Cada modo cambia qué objetivos, procesos, skills, risk floors y KPIs tienen prioridad, pero no cambia las leyes de autoridad, evidencia ni memoria.

## 21.2 Ciclo operativo canónico

```text
1. WAKE
   señal material

2. RESTORE
   Company State + objectives + Work + Memory + active genes

3. PREFLIGHT
   objective / lifecycle intent / risk / budget / authority / dependencies /
   process / capabilities / evidence / routing mode

4. ROUTE / DECIDE
   noop | direct | fan_out | collaborate | challenge | debate | compete | escalate

5. DELEGATE
   Work + Delegation + grants + temporary team/strategy overlays

6. EXECUTE
   Mission Graph + Capability Router

7. VERIFY
   evidence proportional to risk

8. SETTLE
   Business Receipt + Outcome + cost + KPI + authoritative state

9. FITNESS / LEARN
   update candidates/genes only when a verified outcome gates learning; attach sanitized trace evidence when available

10. EVOLVE IF WARRANTED
   Pareto → champion/challenger/silent → bounded experiment/promotion

11. SLEEP
   no model call until material signal
```

El loop de evolución no obliga a mutar algo en cada ejecución; cuando no hay evidencia suficiente, sólo se registra outcome y se sigue operando.

---

# 22. Company State y Business Ledger

XanxitoSpA necesitará un estado empresarial canónico pequeño suficiente para decidir.

Debe poder representar al menos:

- objetivos;
- KPIs;
- revenue;
- margin;
- cash/budgets;
- pipeline/customer state según empresa;
- proyectos/Work;
- riesgos/incidentes;
- activos;
- decisiones;
- eventos/outcomes;
- lifecycle intent cuando sea material;
- champions/challengers activos cuando afecten la decisión.

El ledger registra hechos empresariales append-only cuando sea apropiado. La memoria no reemplaza este ledger.

---

# 23. Autoridad y riesgo

Se conserva la idea fuerte de IO:

- finalidad de la empresa;
- capital corporativo / límites superiores;
- límites críticos;
- acciones irreversibles;
- modificación constitucional;

son categorías reservadas a autoridad humana/Board salvo política futura explícita extremadamente controlada.

Escala conceptual:

```text
LOW
Direct / optional challenge

MEDIUM
Challenge, COMPETE o Debate según incertidumbre + independent verification

HIGH
COMPETE/Debate cuando aporte evidencia + review/approval + independent execution/verification

CRITICAL
Founder / Board
```

Nadie se autoaprueba ni se autoverifica cuando la política exige independencia.

## 23.1 Progressive Autonomy por proceso

La autonomía se gana por **proceso + scope + contexto**, no por una reputación global del agente.

```text
L0 OBSERVE
L1 ASSIST
L2 PROPOSE
L3 EXECUTE_WITH_APPROVAL
L4 EXECUTE_WITHIN_BUDGET_AND_GUARDS
L5 AUTONOMOUS_WITHIN_CONSTITUTION
```

La promoción exige outcomes verificados, tamaño de muestra y ausencia de incidentes incompatibles con el nivel. Puede existir **democión automática** ante degradación, anomalías, cambios de contexto o incidentes. Ningún nivel elimina acciones Founder/Board reservadas.

---

# 24. Economía computacional

La empresa debe conocer costo por resultado, no celebrar cantidad de agentes/tokens.

Presupuestos pueden existir por:

- Company;
- departamento;
- misión/Work;
- capability/provider;
- herramienta externa;
- creative generation;
- worker runtime.

Business Preflight puede reducir fan-out o seleccionar providers más baratos según presupuesto/riesgo/calidad.

---

# 25. Qué se hereda de Xanxittoo

No se copia el producto literalmente; se conserva su disciplina operacional probada:

- sesión/handoff durable;
- recuperación de memoria relevante;
- preflight antes de trabajo significativo;
- routing por capability;
- paralelismo sólo de ramas independientes;
- shared-state writes secuenciales;
- evidencia proporcional al riesgo;
- consolidación superior;
- aprendizaje durable sólo cuando vale la pena;
- browser como recurso controlado;
- local-first cuando aplique.

---

# 26. Qué se extrae de IO

IO no se fusiona dentro de XanxitoSpA. Se usa como fuente de investigación e invariantes probados.

Prioridades de extracción conceptual:

- Heartbeat/no-LLM-on-silence;
- Work separado de Delegation;
- clasificación determinística de riesgo;
- grants deny-by-default;
- separation of duties;
- durable events;
- idempotency;
- fencing/recovery/undo;
- context compilation;
- outcomes;
- learning candidate/promotion;
- Company State/KPI thinking;
- temporary roles/workforce;
- verified learning.

No se copia por defecto la propuesta física de 30 packages. XanxitoSpA comienza mucho más pequeño.

## 26.1 Qué se extrae de Kiiess, Dictador Autónomo e investigación 2026

Estas fuentes aportan patrones, no dependencias ni autoridad de diseño.

De **Kiiess** se conserva la evidencia práctica de deliberación paralela, contribuciones independientes, scorecards y revisión dual/blind: dos razonadores sobre la misma pieza encuentran fallas y alternativas distintas. Eso alimenta `COMPETE`, pero XanxitoSpA agrega adjudicación, outcomes y evolución posterior.

De **Dictador Autónomo v2** se rescatan `decision genes`, `decision events`, `evolution hypotheses`, A/B, autonomía progresiva y la intuición de crear nuevas unidades cuando una oportunidad ya justifica infraestructura propia. Se rechazan explícitamente: utilidad instantánea como única directriz, ignorar históricos/baselines, percentiles rígidos de extinción y asumir LangGraph/Redis/BullMQ como requisitos del producto.

De la investigación 2026 sobre multi-agent debate/evolution se conserva: independencia antes de deliberar, diversidad intencional de estrategias, pocas rondas, evitar mayoría como autoridad, optimización multiobjetivo costo/calidad, Pareto, conservación de resultados negativos y exploración continua para evitar monocultura.

De marcos empresariales cross-industry se conserva la idea de que el kernel debe cubrir funciones y procesos universales —estrategia, revenue, delivery/operations, customer, finance, risk y soporte— y distinguir formación, operación, mejora, crecimiento, expansión, recuperación y salida sin hardcodear un rubro.

---

# 27. Criterios de éxito

XanxitoSpA no se evalúa por:

- cantidad de agentes;
- cantidad de prompts;
- cantidad de mensajes;
- tokens consumidos;
- reuniones entre bots.

Se evalúa por:

- objetivos empresariales logrados;
- utilidad/margen/costo por resultado según empresa;
- velocidad y calidad de decisión;
- trabajo terminado;
- autonomía segura;
- continuidad/recovery;
- errores no repetidos;
- precisión de memoria;
- aprendizaje demostrado;
- trazabilidad;
- capacidad de montar nuevas empresas;
- capacidad de adoptar empresas existentes sin destruir sus fuentes de verdad;
- capacidad de lanzar/retirar nuevas business units con evidencia;
- mejora demostrable de Corporate Genes frente a baselines;
- costo por outcome y frontera calidad/costo/riesgo;
- capacidad de aprovisionar y operar herramientas reales.

---

# 28. Decisiones cerradas hasta esta versión

1. XanxitoSpA será genérico, no específico a una empresa/rubro.
2. GPT-5.6 Sol será único principal cognitivo.
3. Otros modelos serán capabilities/tools.
4. Kernel pequeño y providers reemplazables.
5. La Constitución y restricciones durables están por encima de cualquier optimización económica.
6. El objetivo económico es valor empresarial sostenible dentro de Constitución, no utilidad instantánea sin límites.
7. Supervisores relativamente permanentes + workers dinámicos.
8. Business Preflight recursivo en Executive/Department/Worker.
9. Mission Graph con fan-out, handoff, join, collaborate, challenge, debate, **compete** y reduce.
10. `COMPETE` ejecuta la misma tarea en workers inicialmente ciegos con strategy overlays distintos; dos candidatos es el default.
11. Debate usa una ronda por defecto y dos como máximo.
12. Decision ownership explícito; no votación de agentes.
13. Competencia de ideas; cooperación después de la decisión.
14. Memoria por scopes; worker principalmente efímero.
15. Cross-department knowledge por eventos/contratos, no contaminación directa de memoria.
16. Work y Delegation separados.
17. Authority deny-by-default y proportional risk.
18. Progressive Autonomy se asigna por proceso/scope y puede promoverse o degradarse por evidencia.
19. MCP/API → CLI/SSH → browser fallback.
20. Company Bootstrap sirve tanto para empresa nueva como para adopción de empresa existente.
21. Company Lifecycle incluye Bootstrap, Operate, Improve, Grow, Expand, Recover y Exit.
22. Business Unit Spawning reutiliza el mismo kernel para nuevas marcas/canales/países/unidades.
23. Las cuentas/activos pertenecen a Company; workers reciben grants.
24. Budgets/envelopes en vez de aprobación por cada gasto permitido.
25. Data Plane universal y adaptable.
26. Database, Event Ledger, Memory, Process y Skill son conceptos separados.
27. Creative Plane de primera clase con routing semántico.
28. CAD/BIM se separa de 3D creativo.
29. Documentos autoritativos se componen preferentemente con renderer determinista.
30. Heartbeat 24/7 sin LLM cuando no hay novedad material.
31. Learning con promoción gateada por outcomes verificables; trazas sanitizadas sirven como evidencia explicativa, nunca como autoridad autónoma.
32. Corporate Genes versionan Strategy/Process/Skill/TeamComposition/ProviderRouting; no agentes ni pesos del modelo.
33. Fitness es multiobjetivo, contextual y Pareto-first; no una única métrica global.
34. Variantes conservan lineage, sample size, confidence, costo y resultados negativos.
35. Estados evolutivos V1: candidate, challenger, champion, silent, quarantine y retired.
36. Corporate Evolution Cycle se activa por evidencia/materialidad, no exige un cron nocturno fijo.
37. Evolución nunca puede ampliar autoridad, presupuesto, Constitución ni rebajar hard filters por sí sola.
38. Debe mantenerse exploración/challengers para evitar monocultura.
39. IO permanece separado como investigación/laboratorio; Xanxittoo permanece separado como harness de ingeniería/operaciones.
40. Kiiess y Dictador Autónomo son fuentes de patrones/lecciones, no dependencias del producto.

---

# 29. Decisiones de implementación V1 cerradas

Las 20 decisiones que estaban abiertas quedan cerradas en esta versión. Los proveedores externos de capabilities son **defaults reemplazables**: su disponibilidad, precio o soporte regional puede cambiar sin reabrir la arquitectura. Si un proveedor no es elegible para una Company, el Provider Registry debe seleccionar otro o escalar; nunca deformar el kernel para acomodarlo.

## 29.1 Nombre, repo y namespaces

- repo canónico: `xanxitospa`;
- packages npm: `@xanxitospa/*`;
- prefijo de variables de entorno propias: `XSPA_`;
- schema PostgreSQL del producto: `xspa`;
- IDs durables: UUID;
- IDs humanos de procesos/skills/capabilities: `kebab-case` versionado.

El nombre comercial de una Company no afecta namespaces internos.

## 29.2 Stack técnico exacto del runtime

V1 usará:

- Node.js 24 LTS;
- TypeScript en modo strict;
- pnpm workspace;
- Fastify para HTTP/control API;
- SDK MCP oficial para exponer capabilities/control al host GPT;
- PostgreSQL 18 mediante SQL explícito y migraciones versionadas; no ORM como dueño del dominio;
- React + Vite para Control Plane web/PWA;
- Vitest para verificación automatizada del runtime;
- Biome para formato/lint.

Forma física inicial:

```text
apps/
├── runtime
└── control-plane
packages/
├── kernel
├── contracts
├── domain
├── database
├── capabilities
├── providers
├── skills
└── testing
```

El dominio no depende de Fastify, React ni proveedores externos. El daemon/runtime puede correr como un único servicio al principio.

## 29.3 Almacenamiento autoritativo

**PostgreSQL 18 será la fuente autoritativa del kernel.**

Guardará:

- Companies y Manifest snapshots;
- Company State materializado;
- Work y Delegation;
- Mission Graphs y ejecuciones;
- BusinessEvent ledger;
- receipts/evidence metadata;
- budgets y authority grants;
- scheduler/heartbeat cursors;
- idempotency journal, leases y fencing tokens;
- memory metadata;
- Skill Registry;
- Provider Registry;
- Asset Registry;
- Corporate Genes + lineage + fitness snapshots;
- Evolution Hypotheses / experiments + negative-result ledger.

Blobs grandes, archivos, media, documentos y backups irán a object storage S3-compatible.

V1 **no requiere Redis, Kafka, una vector DB separada ni un workflow engine externo**. PostgreSQL será también la cola durable inicial. `pgvector` se habilita sólo cuando una Company necesite recuperación semántica.

## 29.4 Company Manifest

El Company Manifest es configuración constitucional/operativa versionada, no estado transaccional cotidiano.

Formato autor: YAML validado contra JSON Schema. Cada versión aceptada se guarda como snapshot inmutable con digest.

Contrato mínimo:

```yaml
manifest_version: 1
company:
  id: uuid
  name: string
  jurisdiction: string
  timezone: string
  languages: []
  currencies: []
purpose: string
business_model: {}
objectives: []
departments: []
authority_policy: {}
budgets: {}
capabilities: {}
data: {}
memory: {}
integrations: {}
creative: {}
lifecycle: {}
evolution: {}
heartbeat: {}
reserved_human_actions: []
```

Modificar Manifest requiere una decisión/receipt versionada. Los pedidos, caja, clientes, Work o campañas no se guardan dentro del Manifest.

## 29.5 Company State y BusinessEvent

XanxitoSpA **no será full event-sourced**.

Las tablas de dominio son el estado operacional autoritativo. `CompanyState` es una proyección compacta y revisable para el Executive:

```text
company_id
revision
as_of
objectives + progress
KPI snapshot
cash/budget summary
active missions/work
material risks
capability/asset health
material incidents
company/mission lifecycle intent
active champion/challenger refs when material
```

`BusinessEvent` es append-only y usa este envelope:

```text
id
company_id
type
occurred_at
actor_principal
correlation_id
causation_id
idempotency_key
payload
sensitivity
evidence_refs
```

Los eventos despiertan heartbeats y sirven para auditoría/coordinación, pero no sustituyen todas las tablas de dominio.

## 29.6 Contrato de Business Preflight

Entrada mínima:

```text
company_id
goal
trigger/event
requesting_principal
current_state_ref
available_authority_ref
budget_ref
```

Salida estructurada obligatoria:

```text
objective
materiality
risk: low | medium | high | critical
owner
route: noop | direct | fan_out | collaborate | challenge | debate | compete | escalate
departments[]
work_units[]
dependencies[]
parallel_groups[]
required_skills[]
required_capabilities[]
authority_checks[]
budget_limits
evidence_required[]
success_conditions[]
rollback
terminal_condition
escalation_condition
rationale_summary
```

Los datos determinísticos —presupuesto disponible, grants, estado, límites, riesgo reservado— se calculan antes o se validan después del razonamiento. GPT propone el plan; el kernel valida que sea ejecutable.

## 29.7 Contrato de Mission Graph

Cada misión es un **DAG finito y versionado**. No se permiten loops libres.

Node mínimo:

```text
id
kind
owner
objective
input_refs[]
depends_on[]
authority_ref
budget_ref
skill_refs[]
capability_refs[]
timeout
retry_policy
success_condition
output_contract
```

Kinds V1:

```text
work
collaborate
challenge
debate
compete
join
capability
verify
decide
settle
```

`debate` es una primitiva atómica con una ronda por defecto y máximo dos, no un ciclo del DAG. `compete` es un subgrafo acotado: ramas blind independientes → cross-critique opcional/acotado → adjudicación → experimento opcional. Tampoco crea loops libres. Un supervisor puede expandir dinámicamente una misión sólo dentro de su fan-out, presupuesto y autoridad; cada expansión crea una nueva revisión del grafo.

## 29.8 Ejecución y concurrencia

V1 usa un daemon con scheduler + cola PostgreSQL.

Reglas:

- claim durable con lease/fencing;
- `FOR UPDATE SKIP LOCKED` o equivalente para trabajo concurrente;
- idempotency key obligatoria para efectos repetibles;
- intent journal antes de efecto externo;
- reconciliación después del efecto;
- shared-state writes se serializan por Company/agregado;
- nodos independientes del Mission Graph pueden correr concurrentemente;
- Executive: máximo inicial 4 ramas;
- Department: máximo inicial 4 workers;
- Worker: máximo inicial 2 I/O independientes;
- `COMPETE`: 2 candidatos por defecto y cuenta contra el fan-out/compute budget del owner;
- workers no crean subworkers directamente.

Un crash no implica repetir ciegamente un efecto externo: se reanuda desde journal/evidencia y se reconcilia.

## 29.9 Departamentos iniciales y KPIs

Toda Company parte evaluando seis funciones base. Puede deshabilitar una sólo si el Manifest demuestra que no aplica.

### Executive & Strategy

- progreso de objetivos;
- resultado económico principal;
- caja/runway cuando aplique;
- riesgos materiales;
- backlog de decisiones y misiones.

### Commercial & Revenue

- revenue/pipeline;
- conversión o win-rate;
- margen comercial;
- eficiencia de adquisición/marketing cuando aplique;
- forecast vs resultado.

### Finance

- cash disponible;
- margen bruto/neto según modelo;
- budget variance;
- cuentas por cobrar/pagar cuando aplique;
- compromisos financieros próximos.

### Operations

- throughput/capacidad;
- costo unitario o costo de entrega;
- SLA/lead time;
- backlog/stock/capacidad según negocio;
- incident rate.

### Customer

- tiempo de respuesta;
- tasa de resolución;
- satisfacción/retención/churn/devoluciones según modelo;
- problemas repetidos.

### Administration & Risk

- obligaciones/plazos;
- acciones no autorizadas;
- riesgos abiertos;
- estado de contratos/proveedores/activos críticos;
- incidentes de compliance/seguridad.

Product, Creative, Technology, People, Supply Chain, Legal, Research, Security e Infrastructure son módulos opcionales. Ningún KPI se inventa: el Manifest selecciona los aplicables y su fuente de verdad.

## 29.10 Department Memory y lectura cruzada

Cada `MemoryObject` durable contiene al menos:

```text
id
company_id
scope: company | department | restricted
department
type
statement
evidence_refs[]
source
valid_from
valid_until/review_at
status: candidate | active | superseded | retired
revision
```

Permisos V1:

- Department Supervisor: read/write-candidate en su namespace;
- worker: recibe snapshot scoped read-only y sólo puede proponer candidates/outcomes;
- Executive: puede leer memoria `company` y departamental salvo datos `restricted` que exijan grant explícito;
- otro departamento: sólo lee conocimiento publicado como `company`, BusinessEvents autorizados o vistas/contratos explícitos;
- ningún worker escribe directamente memoria durable `active`.

Promoción a memoria activa exige evidencia/política de learning.

## 29.11 Skill Registry

Las Skills V1 son **declarativas**. No ejecutan código arbitrario.

Package mínimo:

```text
skill.yaml
SKILL.md
examples/
evals/
```

Manifest de skill:

```text
id + version + digest
purpose
inputs/outputs
allowed_capability_classes
data_scopes
risk_class
provenance
license
dependencies
eval_suite
```

Las versiones de una Skill pueden participar como `SkillGene`, pero la evolución sólo crea/promueve **candidatos declarativos**; nunca introduce código ejecutable arbitrario dentro de la Skill.

Importar una skill externa sigue:

```text
source
→ quarantine
→ validar licencia/provenance/estructura
→ revisar capacidades solicitadas
→ sandbox eval
→ comparar baseline
→ candidate
→ promote/reject
```

Galyarder, AgentScope/Skill Hub y otras colecciones pueden ser fuentes, nunca trust roots. Si una skill necesita código, ese código se publica como Capability/Provider separado y pasa su propio control.

## 29.12 Provider Registry y routing

Cada provider declara:

```text
capabilities
regions/jurisdictions
input/output formats
estimated cost
latency p50/p95
reliability
quality score por capability
privacy/data policy
rate limits
health
credentials_ref
```

Routing en dos etapas:

1. **hard filters:** capability, región, compliance/privacy, disponibilidad, formato, budget, authority;
2. **selection mode:** `quality`, `cost`, `latency` o `balanced`.

Reglas:

- `quality`: máxima calidad; desempate por reliability y costo;
- `cost`: menor costo entre providers que superan el quality floor;
- `latency`: menor p95 entre providers que superan el quality floor;
- `balanced`: score normalizado inicial = 35% quality + 25% reliability + 15% privacy + 15% inverse-cost + 10% inverse-latency.

Los scores operacionales se actualizan con telemetría/outcomes. Cambiar allowlists, requisitos de privacidad o providers financieros críticos requiere autoridad explícita; el learning no puede rebajar esos límites por sí solo.

## 29.13 Secret manager

Default V1: **Infisical** detrás de `SecretCapability`.

- un Machine Identity del runtime obtiene tokens de corta duración;
- el secret-zero se entrega mediante credencial del OS/systemd o equivalente de deployment;
- namespace separado por Company/environment/provider;
- secretos nunca se guardan en PostgreSQL, Memory, prompts, receipts ni BusinessEvents;
- workers reciben handles/capabilities, no valores secretos;
- rotación/revocación se registra como evento sin registrar el secreto.

La abstracción permite reemplazar Infisical por AWS/GCP/Azure/1Password/OpenBao sin modificar dominio.

## 29.14 Providers iniciales de comunicación, identidad y pagos

Defaults V1:

- correo/calendar/contacts: Google Workspace + Gmail/Calendar/Contacts APIs;
- alta de usuarios/aliases: Google Workspace Directory API;
- teléfono/SMS: Twilio cuando la numeración/regulación local lo permita;
- DNS: Cloudflare como primer adapter cuando la Company lo configure;
- procesamiento de pagos: Stripe cuando el país/producto sea elegible;
- tarjetas programables: Stripe Issuing **sólo** en jurisdicciones soportadas;
- países sin Issuing elegible: `manual-card`/bank connector con ingestión de movimientos y aprobaciones; no simular aprovisionamiento autónomo.

KYC, MFA, captcha, aceptación contractual y verificaciones de identidad son fronteras de `company-bootstrap` que pueden pedir intervención humana. Browser interactivo sólo se usa cuando API/MCP/CLI no puede completar esa frontera.

## 29.15 Política financiera V1

**Default global: capacidad de gasto = 0.**

La autonomía financiera comienza sólo después de que Founder/Board aprueba un `BudgetEnvelope`:

```text
company_id
department
currency
period
period_cap
per_transaction_cap
allowed_categories/providers
blocked_categories/providers
approved_beneficiaries
valid_from/to
approval_owner
```

Dentro de envelope + proveedor/categoría/beneficiario aprobado + per-transaction cap, la compra/pago puede ser autónomo y queda verificado/conciliado.

Siempre escalan inicialmente:

- gasto fuera de envelope;
- primer pago a beneficiario nuevo;
- apertura/cierre de cuenta bancaria o programa de tarjetas;
- crédito, deuda, préstamos o garantías;
- cambio de límites corporativos de crédito/capital;
- cash withdrawal;
- cripto/inversiones financieras no definidas por mandato explícito;
- movimientos irreversibles de capital;
- declaraciones/pagos tributarios finales;
- acuerdos jurídicos o settlements.

Pagos recurrentes a proveedores previamente aprobados pueden automatizarse dentro del envelope.

## 29.16 Data Plane y provisioning

Stack de datos inicial:

- PostgreSQL 18 para operacional/ledger/cola/metadata;
- `pgvector` sólo si se necesita semantic retrieval;
- PostgreSQL full-text antes de introducir un search service dedicado;
- object storage S3-compatible para archivos, media y backups;
- DuckDB sólo como herramienta efímera de analytics/batch, no fuente de verdad.

No existe vendor managed obligatorio. Provider adapters iniciales son `postgres` mediante `DATABASE_URL` y `s3-compatible`. En desarrollo pueden aprovisionarse localmente; en producción `data-provisioning` selecciona un servicio managed elegible según región, costo, residencia y SLA.

Toda base provisionada debe nacer con owner, backup policy, retention, health check y restore-test programado.

## 29.17 Creative Plane — implementación inicial V0.6

La política activa es **one-model/OpenAI-only** para capacidades cognitivas y generativas. Business tools siguen siendo provider-neutral.

```text
executive reasoning      → gpt-5.6-sol / max
all subordinate reason   → gpt-5.6-sol / xhigh
image generation/edit    → Responses image_generation tool
vector/diagrams          → GPT + deterministic SVG/code
document/presentation    → GPT + deterministic renderer
video final generation   → STAGED / unavailable
secondary model provider → DENY
provider multi-agent     → DENY
```

La capa semántica no contiene nombres de vendor; la One Model Law vive en `PrincipalPolicy`/`CreativePolicy`. Esto permite que `creative.image.generate` siga siendo lenguaje de negocio mientras V1 lo resuelve por la única ruta autorizada.

El motivo de no activar video es explícito: al corte de agosto de 2026 GPT-5.6 Sol no expone video output/tool estable y los modelos documentados en `/v1/videos` (Sora 2 / Sora 2 Pro) aparecen Legacy/Deprecated. El sistema puede producir storyboard, guión, shot list y keyframes de imagen, pero no debe fingir soporte de render final.

CAD, hosting, correo, bases de datos y otros servicios pueden seguir usando adapters externos porque son herramientas empresariales, no principals/model providers.

ADR canónico: `docs/adr/0005-one-model-law.md`.

## 29.18 Company Gym / evals iniciales

Antes de actuar sobre producción, el harness debe pasar un gym con **fake capabilities y graders de estado final**. Un LLM judge puede aportar señal secundaria, nunca ser el único grader de invariantes.

Suite mínima V1:

1. idle heartbeat → cero invocación GPT;
2. fan-out de dos departamentos → reduce correcto;
3. `COMPETE` con dos workers blind sobre la misma tarea → propuestas independientes, evidencia comparable y owner adjudica;
4. colaboración interdepartamental sin escalar innecesariamente al Executive;
5. debate usa una ronda por defecto, nunca supera dos y owner decide;
6. acción sin grant → DENY sin efecto;
7. gasto dentro de envelope → permitido; fuera → escalado;
8. provider falla → fallback sin duplicar efecto/costo indebido;
9. crash después de efecto externo → reconcile sin repetirlo ciegamente;
10. Company A no puede leer/escribir Company B;
11. learning sólo promueve conocimiento/genes desde outcome verificado;
12. variante dominada queda `silent` y su resultado negativo evita repetirla sin cambio explícito de contexto/hipótesis;
13. Progressive Autonomy no puede promocionarse sin evidencia y puede degradarse ante incidente;
14. Corporate Evolution no puede modificar Constitución, grants, budget ni hard filters;
15. bootstrap/adoption de Company reconstruye fuentes de verdad antes de reorganizar procesos.

Un release de autonomía no puede declarar producción-ready si falla cualquiera de los invariantes 3–15.


## 29.19 Human Control Plane

V1 tendrá dos superficies, una sola autoridad:

1. **Web/PWA responsive** para operación humana;
2. **MCP surface** para que GPT/host autorizado consulte y opere el runtime.

La Web/PWA muestra como mínimo:

- objetivos/KPIs;
- missions/Work;
- approvals/escalations;
- departamentos/workers activos;
- budgets y spend;
- capabilities/assets/providers;
- events/receipts/evidence;
- memory/process/skills;
- incidents/health.

No se construye app móvil nativa inicialmente. Chat puede ser interfaz, pero no fuente de verdad. Autenticación humana usa OIDC/provider externo; XanxitoSpA no inventará su propio sistema de passwords. En desarrollo local se permite identidad loopback de dev claramente separada de producción.

## 29.20 Multi-Company deployment

Default V1: **un runtime puede operar múltiples Companies**.

Aislamiento obligatorio:

- `company_id` en todo objeto tenant-owned;
- PostgreSQL Row Level Security como defense-in-depth;
- adapters y repositorios siempre company-scoped;
- namespaces separados en Infisical;
- prefixes/buckets separados en object storage;
- budgets, provider credentials, memory, Work y queues separados;
- heartbeat/leases/fencing por Company;
- cero cross-company memory por defecto.

Para una empresa regulada, de alto riesgo o gran carga, se permite `dedicated deployment` usando exactamente los mismos artefactos y contratos. Multi-Company es una forma de deployment, no una relajación del aislamiento.

## 29.21 Estado de decisiones

**No quedan decisiones arquitectónicas V1 abiertas antes del runtime.** Esta declaración fue revalidada después de incorporar evidencia nueva sobre competitive branching, evolución darwiniana, lifecycle empresarial y autonomía progresiva.

Lo que sí puede cambiar sin reabrir arquitectura:

- versión concreta de un proveedor externo;
- precio/latencia/calidad medida;
- disponibilidad por país;
- API keys instaladas para una Company;
- pesos/configuración de routing aprobados;
- departamentos opcionales;
- KPIs específicos del modelo de negocio;
- budgets y límites concretos;
- champions/challengers por contexto;
- fitness observations y Pareto frontier;
- lifecycle intent de misiones concretas.

Todo eso es configuración, provider state o evolución versionada del sistema, no ambigüedad fundacional.

---

# 30. Próximo paso autorizado

Diseñar el **mínimo vertical ejecutable de XanxitoSpA** sin intentar implementar toda la empresa.

Primer recorrido canónico:

```text
Founder entrega objetivo simple
→ Executive Business Preflight
→ lifecycle intent explícito
→ fan-out a 2 departamentos para dimensiones distintas
→ un supervisor usa COMPETE sobre una misma subtarea con 2 workers blind
→ cross-critique acotado + owner adjudica
→ colaboración estructurada entre departamentos
→ capability reversible en sandbox/local
→ verificación
→ Business Outcome / Receipt
→ fitness de candidate/challenger
→ memoria departamental candidata / Corporate Gene candidate
→ no-op evolution o promoción sólo si la evidencia alcanza
→ cierre/sleep
```

Ese primer vertical debe probar primero el **harness empresarial + competencia controlada + settlement/evolution boundary**, no correo, pagos, 3D ni veinte integraciones a la vez.

Luego agregar capacidades universales como providers desacoplados.

---

# 31. Principio final

> XanxitoSpA no programa una empresa concreta. Programa una forma disciplinada de formar, adoptar, dirigir, competir ideas, coordinar, equipar, verificar y evolucionar cualquier empresa.

El Executive debe ser excelente mandando y consolidando. Los supervisores deben ser excelentes dirigiendo su función. Los workers deben ser pequeños, especializados y reemplazables. Las herramientas deben ser capabilities. La memoria sólo puede promover aprendizaje cuando existe outcome verificado; las trazas sanitizadas explican la ejecución sin sustituir esa evidencia. Las estrategias deben competir cuando la incertidumbre lo justifique. Los Corporate Genes deben sobrevivir por evidencia contextual, no por retórica. Y la autonomía debe crecer —o retroceder— con resultados verificados, nunca con cantidad de agentes.
