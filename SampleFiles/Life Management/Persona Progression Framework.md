## Overview

The Persona Progression Framework defines the conceptual model used throughout the assistant.

The assistant is not designed to manage tasks, habits, or productivity in isolation. Instead, it exists to support the gradual development of long-term identities, referred to as **Personas**.

Applications such as Todoist, GitHub, Obsidian, Fitbit, calendars, journals, and future integrations are merely sources of information. They provide evidence of progress, but they do not define progress themselves.

The Persona Progression Framework provides the structure that gives meaning to this information.

Every recommendation, workflow, notification, automation, and dashboard should ultimately answer one question:

> **"How does this help me become the person I aspire to be?"**

---

# Framework Hierarchy

Every persona follows the same progression model.

```text
Persona/
├── Persona.md (kind: persona)
├── Vision.md
├── Principles.md
└── Stage/
    ├── Stage.md (kind: stage)
    └── Milestone/
        ├── Milestone.md (kind: milestone)
        └── Objective/
            ├── Objective.md (kind: objective)
            └── Quest/
                └── Quest.md (kind: quest)
```

Each level serves a distinct purpose.

| Level                | Question it Answers                                                       | File Structure |
| -------------------- | ------------------------------------------------------------------------- | --- |
| Persona              | Who am I trying to become?                                                | `PersonaName/PersonaName.md` |
| Vision               | What does the fully developed version of this persona look like?          | `PersonaName/vision.md` |
| Principles           | How should this persona be developed?                                     | `PersonaName/principles.md` |
| Stage                | Which phase of development am I currently in?                             | `PersonaName/StageName/StageName.md` |
| Milestone            | What major transformation am I working toward?                            | `StageName/MilestoneName/MilestoneName.md` |
| Objective            | Which capabilities must be established before this milestone is complete? | `MilestoneName/ObjectiveName/ObjectiveName.md` |
| Quest                | What should I work on next?                                               | `ObjectiveName/QuestName/QuestName.md` |
| Task / Habit / Event | What evidence exists that progress is being made?                         | External systems (Todoist, GitHub, etc.) |

---

# Persona

A Persona represents a long-term identity.

Examples include:

* A PhD
* Amazing Athlete
* Career Architect
* Heart Maestro
* Mental Gymnast
* Obsidian Guru
* Open Source Maseiha
* Prosperity Engineer
* Super Hustler

A persona should be relatively timeless.

It represents who the user wishes to become rather than what they happen to be working on today.

Personas should evolve slowly and only when the user's long-term aspirations change.

---

# Vision

The Vision defines the ultimate destination for a persona.

It should describe the person who has fully embodied that identity.

A vision should focus on enduring capabilities, values, and identity rather than temporary goals or measurable metrics.

The Vision rarely changes.

---

# Principles

Principles define the philosophy used while developing a persona.

They guide decision-making and ensure that future milestones remain aligned with the intended spirit of the persona.

Examples include:

* Consistency over intensity.
* Capability over appearance.
* Systems over motivation.
* Sustainability over optimization.

Principles are not goals.

They are the values that shape how goals are pursued.

---

# Stages

Stages divide a lifelong journey into meaningful phases of development.

Each stage has:

* a different mindset,
* different priorities,
* different success criteria,
* and different assistant behaviour.

Stages represent genuine transformations rather than arbitrary experience levels.

Progression to a new stage should occur only when the current stage has become stable.

---

# Milestones

Milestones represent significant transformations within a stage.

They usually require weeks or months of sustained effort.

Examples include:

* Become a Swimmer
* Fix Nutrition
* Publish First Plugin
* Complete First Research Project

A milestone is complete only when the underlying transformation has become established.

Completing a single task does not complete a milestone.

---

# Objectives

Objectives describe the capabilities required to complete a milestone.

They answer the question:

> **"What must become true before this milestone can be considered complete?"**

Objectives are capabilities rather than sequential steps.

For example, the milestone **Become a Swimmer** may require objectives such as:

* Access to a swimming pool
* Required equipment
* Confidence in the water
* A consistent swimming routine
* Basic swimming technique

Some objectives may already be satisfied before work on a milestone begins.

Others may regress over time.

The assistant should continuously assess which objectives remain incomplete and generate appropriate quests to strengthen them.

---

# Quests

Quests are the assistant's planning mechanism.

A quest is a concrete, short-term objective designed to advance one or more objectives.

Unlike milestones, quests are dynamic.

The assistant may:

* create new quests,
* modify existing quests,
* postpone quests,
* or archive completed quests

as circumstances change.

The assistant should always maintain a manageable number of active quests.

---

# YAML Frontmatter and Metadata

Every markdown file in the framework includes YAML frontmatter to explicitly define its role and hierarchical context.

## Structure

Each file begins with a YAML block that includes:

* `kind`: The type of entity (`persona`, `stage`, `milestone`, `objective`, `quest`)
* `persona`: The name of the persona (required for all levels except persona itself)
* `stage`: The name of the stage (required for stage and below)
* `milestone`: The name of the milestone (required for milestone and below)
* `objective`: The name of the objective (required for objective and below)
* `status`: The current status of a quest (`active`, `future`, or `completed`)

## Examples

**Persona File** (`A PhD/A PhD.md`):
```yaml
---
kind: persona
persona: A PhD
---
```

**Stage File** (`A PhD/Foundation/Foundation.md`):
```yaml
---
kind: stage
persona: A PhD
stage: Foundation
---
```

**Milestone File** (`A PhD/Foundation/Complete workflow/Complete workflow.md`):
```yaml
---
kind: milestone
persona: A PhD
stage: Foundation
milestone: Complete workflow
---
```

**Objective File** (`A PhD/Foundation/Complete workflow/All corrections and SFs/All corrections and SFs.md`):
```yaml
---
kind: objective
persona: A PhD
stage: Foundation
milestone: Complete workflow
objective: All corrections and SFs
---
```

**Quest File** (`A PhD/Foundation/Complete workflow/All corrections and SFs/Correct the jetPUID/Correct the jetPUID.md`):
```yaml
---
kind: quest
persona: A PhD
stage: Foundation
milestone: Complete workflow
objective: All corrections and SFs
status: active
---
```

---

# Tasks, Habits, and Events

Tasks, habits, and events form the evidence layer of the framework.

Examples include:

Tasks

* Buy swimming goggles.
* Schedule a swimming session.

Habits

* Drink enough water.
* Complete daily mobility exercises.

Events

* Swimming session completed.
* GitHub pull request merged.
* Todoist task completed.

These observations have little meaning on their own.

Their significance comes from the objectives, milestones, and personas they support.

---

# Information Flow

The assistant reasons from evidence upward.

```text
Tasks / Habits / Events
        ↓
Quest Progress
        ↓
Objective Progress
        ↓
Milestone Progress
        ↓
Stage Progress
        ↓
Persona Development
```

Every observation should ultimately contribute toward understanding the user's long-term development.

---

# Adaptive Progression

The framework is intentionally adaptive.

Objectives define desired capabilities.

Quests define the current strategy for building those capabilities.

Because every user begins from a different starting point, the assistant should never assume a fixed sequence of quests.

Instead, it should identify which objectives are already satisfied, which require attention, and generate quests accordingly.

The same milestone may therefore produce different quests for different people—or even for the same person at different points in time.

---

# Design Principles

When introducing a new feature, workflow, or integration, the following questions should always be considered:

1. Which persona does this support?
2. Which stage does it belong to?
3. Which milestone does it advance?
4. Which objective does it strengthen?
5. Which quests should the assistant generate?
6. Which tasks, habits, or events provide evidence?

If these questions cannot be answered, the feature likely does not fit naturally into the Persona Progression Framework.

---

# Closing Philosophy

The assistant should never optimize for completing tasks.

It should optimize for developing identities.

Tasks are temporary.

Habits are repeatable.

Capabilities are enduring.

Identity is the destination.

---

# Naming Convention

To maintain clarity and consistency, the framework enforces strict naming conventions:

1. **Folder Naming**: Each entity (persona, stage, milestone, objective, quest) is represented as a folder with a descriptive name.
2. **File Naming**: Inside each folder, there must be a markdown file with the **exact same name** as the folder.
   * Example: `Complete workflow/Complete workflow.md`
3. **No Intermediate Containers**: There are no separate "Milestones" or "Objectives" folders. Each entity is directly nested within its parent.
4. **Hierarchical Structure**: The folder structure directly represents the hierarchy:
   * `PersonaName/StageName/MilestoneName/ObjectiveName/QuestName/QuestName.md`

---

# Framework Constraints

To prevent over-complication and maintain focus, the progression framework enforces the following structural constraints:

1. **Active Stage and Milestone Limit**: A persona can only have one **Stage** and one **Milestone** active at any given time. An active stage/milestone is defined as the one currently containing active quests.
2. **Mandatory Documentation**: Every persona must contain a `vision.md` and a `principles.md` document in its root directory.
3. **Vision Section Constraint**: The `vision.md` document must contain a `Vision` section (or heading) consisting of exactly **3 to 4 sentences** imagining what the user will ultimately become or feel.
4. **Principles Limit**: A persona's `principles.md` is limited to a maximum of **4 principles**.
5. **Active Quests Limit**: A persona is limited to a maximum of **5 active quests** across all objectives at any given time to ensure focused execution.
