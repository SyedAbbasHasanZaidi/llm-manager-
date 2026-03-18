# CLAUDE.md

# AI Agent Engineering Rules

This document defines mandatory engineering and system explanation rules
for ANY AI agent operating in this repository.

These rules apply to:

- Claude Code
- Cursor AI
- automated coding agents
- LLM-based development tools
- any system capable of modifying or analyzing this codebase.

All agents must follow these rules when:

- generating code
- modifying existing code
- analyzing the system
- explaining system architecture
- implementing features

These rules are atomic and must apply regardless of scope, including:

- single functions
- individual modules
- individual features
- full system design
- codebase analysis

## System Design, Implementation, and Explanation Rules

This document defines the expectations for how Claude (or any AI coding assistant) must design, implement, analyze, and explain software systems in this repository.

The goal is **deep system understanding and maintainable architecture**, not shallow code generation.

Claude must prioritize:

- architectural clarity
- feature-based reasoning
- maintainable abstractions
- explainability

---

# 1. Atomic Engineering Rules

The following rules are **atomic**.

Atomic means they **must always be applied**, regardless of scope.

They apply when:

- implementing a single function
- building a module
- implementing a feature
- designing an entire system
- analyzing an existing codebase
- debugging a system

Claude must **never skip these rules due to small scope**.

---

## 1.1 Atomic Rule: Explain Data Flow

Claude must always explain **data flow**.

Data flow describes **how information moves through the system**.

This includes:

User input
→ frontend processing
→ API request
→ controller/service logic
→ data transformation
→ database interaction
→ response propagation

Data flow must be explained even for small features.

Example:

Feature: Send Message

Data Flow:

User submits message
→ UI handler processes input
→ API endpoint receives message
→ message validation occurs
→ message stored in database
→ response returned to UI

---

## 1.2 Atomic Rule: Explain Control Flow

Claude must explain **control flow**.

Control flow describes **how execution moves through the system**.

Example:

User clicks button
→ event handler triggered
→ API call executed
→ service processes request
→ database operation performed
→ result returned

---

## 1.3 Atomic Rule: Explain Dependency Flow

Claude must explain **dependency flow**.

Dependency flow describes **how modules depend on one another**.

Example:

Controller
depends on
Service

Service
depends on
Repository

Repository
depends on
Database Adapter

Claude must identify:

- direct dependencies
- indirect dependencies
- dependency direction

Claude must also explain **why the dependency structure was chosen**.

---

## 1.4 Atomic Rule: Explain Design Patterns

If a design pattern is used, Claude must explain:

1. The pattern used
2. Why it was chosen
3. What problem it solves
4. How it appears in the code

Example:

Pattern: Repository Pattern

Purpose:

Separate persistence logic from business logic.

Implementation:

Service
→ uses Repository interface

Repository
→ implemented by database adapter

---

## 1.5 Atomic Rule: Use Appropriate Design Patterns

Claude must prefer **well-known design patterns** when building systems.

Patterns must only be used when they **solve a real design problem**.

Patterns should improve:

- modularity
- maintainability
- testability
- extensibility

Claude must avoid **unnecessary abstraction**.

---

# 2. Feature-Based System Explanation

Claude must **never explain systems purely file-by-file**.

Instead, explanations must follow a **feature-first approach**.

This means:

Identify a feature
Explain its purpose
Trace its full implementation across files.

---

## Example Structure

Feature: User Authentication

Explanation must include:

User Login UI
→ Authentication API endpoint
→ Authentication service logic
→ Password validation
→ Database lookup
→ Token generation
→ Response handling

This demonstrates how **a feature spans multiple files**.

---

# 3. Granular Technical Explanation

Claude must provide deep explanations of system components.

This includes:

- what each module does
- why the abstraction exists
- how modules interact
- what data they exchange

Claude must avoid vague explanations.

---

# 4. Architecture Decisions

When building a system, Claude must explicitly state:

Architecture chosen
Why it was chosen
Tradeoffs
Alternative architectures considered

Examples include:

Layered Architecture
Clean Architecture
Hexagonal Architecture
Microservices
Event Driven Architecture

---

## Example: Hexagonal Architecture

Hexagonal architecture (Ports and Adapters) isolates core business logic from external systems such as databases and user interfaces.

Core domain logic communicates through **ports (interfaces)**, while infrastructure components act as **adapters**.

Claude must explain:

Core Domain
Ports
Adapters
External systems

---

# 5. Tech Stack Explanation

Claude must explain the **entire technology stack**.

This includes:

Programming language
Frameworks
Libraries
Databases
Infrastructure components

Claude must explain:

Why each technology was chosen
What advantages it provides
How it integrates with other parts of the stack

Example:

Node.js
TypeScript
PostgreSQL

Explanation must include:

event-driven runtime advantages
type safety benefits
relational data guarantees

---

# 6. Feature Implementation Walkthrough

For every implemented feature, Claude must clearly trace the complete execution lifecycle:

1. User interaction
2. System processing
3. Data persistence
4. Result propagation

**Crucially, this walkthrough must utilize the ASCII Art Flow Diagram format defined in Section 14.** Pure text-based traces (e.g., `A -> B -> C`) are strictly prohibited for feature walkthroughs.

### Example Expectation

Feature: Chat Messaging

Instead of a simple text list, Claude must provide:

1. **ASCII Visual Flow Diagram:** An ASCII art graph mapping the journey from the user clicking "send", through the frontend handlers, API endpoints, backend validation, database insertion, and back to the UI update.
2. **Architectural State Breakdown:** Following the diagram, Claude must explain the design choices at each specific step in that feature's lifecycle (e.g., explaining _why_ a specific state management pattern handles the UI update, or _why_ a specific validation schema is enforced at the API boundary).

# 7. Module Design Principles

Claude must design modules using these principles.

### High Cohesion

Each module should perform a clearly defined role.

### Loose Coupling

Modules should interact through well-defined interfaces.

### Dependency Inversion

High-level modules should not depend on low-level implementations.

### Single Responsibility Principle

Each component should have one responsibility.

---

# 8. Common Design Patterns

Claude should use appropriate design patterns.

---

## Dependency Injection

Used when components depend on services.

Benefits:

- decouples implementations
- improves testability
- supports modular design

---

## Repository Pattern

Separates data access logic from business logic.

Common in:

Clean Architecture
Domain Driven Design

---

## Factory Pattern

Used when object creation is complex or variable.

Examples:

plugin systems
service creation
runtime configuration

---

## Strategy Pattern

Used when multiple algorithms solve the same problem.

Examples:

payment providers
authentication methods
sorting algorithms

---

## Observer Pattern

Defines a one-to-many dependency between objects.

Observers are automatically notified when the subject's state changes.

Common uses:

event systems
UI updates
message broadcasting

---

## Facade Pattern

Provides a simplified interface to a complex subsystem.

Examples:

SDK wrappers
API orchestration layers

---

# 9. Architecture + Pattern Alignment

Claude must align design patterns with architecture.

Example:

Clean Architecture

Domain Layer
Entities

Application Layer
Use Cases
Services

Infrastructure Layer
Repositories
Adapters

Interface Layer
Controllers
View Models

---

# 10. Code Explanation Requirements

When writing code Claude must explain:

What the function does
Why it exists
How it interacts with other modules
What design patterns are used

---

# 11. System-Level Thinking

Claude must always reason about:

Scalability
Maintainability
Extensibility
Testability

Even when implementing small features.

---

# 12. Codebase Analysis Rules

When analyzing existing code Claude must:

Identify architecture
Identify design patterns
Trace feature implementation across modules
Detect architectural problems

Examples:

tight coupling
God classes
circular dependencies
duplicate logic

---

# 13. Anti-Patterns to Avoid

Claude should avoid:

God Objects
Massive Controllers
Hidden Dependencies
Global State
Over-Engineering

---

# 14. Preferred Explanation Format for System & Feature Overviews

Every system overview or new feature breakdown must be visually anchored. Pure text is insufficient for complex architectures, but because this codebase is heavily interacted with via terminal, **Mermaid or other rendered diagram syntaxes are strictly prohibited.**

Claude must always generate a **Terminal-Friendly ASCII Art Flow Diagram** to visualize the distinct data and control flow threads from input to output. Immediately following the diagram, Claude must break down each state, explicitly explaining the data flow and **why** specific design or architectural choices were made at that specific node.

Every explanation must follow this strict structure:

### 1. System Overview

A concise, high-level summary of what the system or feature does.

### 2. ASCII Art Flow Diagram

A clear, text-based visual representation of the flow using ASCII boxes and arrows.

Example:

---

---

| |
| CLIENT UI |
| (React/Tailwind Component) |
|****\*\*\*\*****\_\_\_\_****\*\*\*\*****|
|
| User Clicks "Save" (JSON Payload)
v

---

| |
| API ROUTE |
| (Next.js App Router POST) |
|****\*\*\*\*****\_\_\_\_****\*\*\*\*****|

---

### 3. State-by-State Architectural Rationale

For every single node/step represented in the ASCII diagram, Claude must detail:

- **Data Flow:** What happens to the data at this state.
- **Design/Arch Choice:** What pattern, tool, or architectural concept is applied here.
- **The "Why":** The technical justification for this choice.

_Example formatting for a state:_

- **State 2: API Route / Controller**
  - _Data Flow:_ Receives client payload and passes it to the User Service.
  - _Design Choice:_ Dependency Injection & Input Validation (Zod).
  - _Why:_ Validating at the boundary ensures bad data never reaches the core domain. Injecting the service keeps the controller testable and loosely coupled.

### 4. Tech Stack Context

How the technologies used support the specific feature.

### 5. Design Patterns Applied

A quick summary of the broader patterns used (e.g., Factory, Strategy) across the flow.

### 6. Tradeoffs

What is gained and what is lost by choosing this specific architecture (e.g., "We gain decoupled services but add network latency").

---

# 15. Objective

Claude’s purpose is not just to generate code.

Claude must:

explain systems clearly
design maintainable architectures
trace feature implementations
teach how the system works

The explanation quality should be comparable to a **senior engineer performing a full system walkthrough**.

# 16. Agent System

This repository may define **specialized AI agents** inside an `/agents` directory.

Each file inside `/agents` represents a **role-specific agent specification**.

Agent files define:

- role
- responsibilities
- constraints
- tools
- operational behavior

These agent specifications must be treated as **active operational instructions**, not passive documentation.

All AI agents working in this repository must inspect and respect these definitions.

---

# 17. Agent Discovery

Before performing any task, AI agents must check whether specialized agents exist.

Procedure:

1. Inspect the `/agents` directory.
2. Read all agent definitions.
3. Determine whether one or more agents match the requested task.

If a task aligns with an agent's defined responsibility, that agent must be used.

Example mapping:

Testing tasks  
→ `agents/test-runner.md`

Database schema tasks  
→ `agents/db-schema-helper.md`

Code review or security auditing  
→ `agents/code-reviewer.md`

Feature implementation  
→ `agents/feature-builder.md`

System analysis  
→ `agents/system-analyzer.md`

Agents should be selected based on **task alignment**, not file names alone.

---

# 18. Automatic Agent Selection

AI agents should automatically select the appropriate specialized agent when a task matches its scope.

Examples:

User request:

"run the tests and diagnose failures"

Agent selected:

`test-runner`

---

User request:

"review this code for security issues"

Agent selected:

`code-reviewer`

---

User request:

"design a database schema for this feature"

Agent selected:

`db-schema-helper`

---

User request:

"implement conversation persistence"

Agent selected:

`conversations-implementer`

---

If multiple agents are relevant, the system must coordinate them.

---

# 19. Agent Collaboration

Some tasks require **multiple agents working together**.

In these situations, agents should collaborate logically.

Example:

Feature: Conversation Persistence

Agents involved:

1. `db-schema-helper`
   → creates migration and schema

2. `feature-builder`
   → implements service logic and API

3. `test-runner`
   → validates system behavior

Agents should operate in **a logical pipeline**.

---

# 20. Parallel Agent Execution

If tasks can be performed independently, agents should run **in parallel**.

Example:

Full system audit:

Agents executed simultaneously:

- `code-reviewer`
- `system-analyzer`
- `test-runner`

Parallel analysis improves system understanding and reduces bottlenecks.

---

# 21. Agent Responsibility Boundaries

Agents must operate strictly within their defined scope.

Examples:

Code reviewer agent  
→ read-only  
→ must never modify code

Test runner agent  
→ executes tests  
→ must not change source code unless explicitly instructed

Database schema agent  
→ creates migration scripts  
→ must not modify application logic

If a task requires changes outside the agent’s scope, the agent must:

1. complete its assigned responsibility
2. report required follow-up actions

---

# 22. Agent Tool Restrictions

Agents must respect tool limitations defined in their specifications.

Example:

Code reviewer agent

Allowed tools:

- read
- search
- analyze

Not allowed:

- editing files
- executing migrations

Tool restrictions must always be enforced.

---

# 23. Agent Coordination With Atomic Engineering Rules

Specialized agents **must still obey all atomic engineering rules defined earlier in this document**.

This includes:

Explaining data flow  
Explaining control flow  
Explaining dependency flow  
Explaining design patterns  
Tracing feature implementation across files

These rules remain **mandatory regardless of which agent is active**.

Agents are not allowed to bypass these requirements.

---

# 24. Fallback Behavior

If no specialized agent matches the requested task:

The AI agent must proceed using the **general engineering rules defined in this document**.

The absence of a specialized agent must never reduce explanation quality or architectural rigor.

---

# 25. Agent System Objective

The agent system exists to improve:

- modular reasoning
- feature-focused development
- separation of responsibilities
- structured analysis

The purpose of agents is not simply automation.

Agents should behave like **specialized engineers collaborating on the same system**.
