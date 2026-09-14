# 🍳 RecipeApp - Especificación de Diseño y Desarrollo (SDD)

## 📋 Resumen Ejecutivo

**Nombre del Proyecto:** RecipeApp  
**Plataforma:** Web App (PWA) responsive, mobile-first  
**Stack:** Angular 19+ (Frontend) + Hono (Backend) + SQLite (DB)  
**Hardware objetivo:** Raspberry Pi 5 (8GB RAM, 1-2GB libres disponibles)  
**Metodología:** TDD con cobertura 100% en edge cases  
**Diseño UI:** Minimalista, moderno, paleta de colores cálidos consistente  
**Sistema de Diseño:** Ver [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md) para detalles completos de UI

---

## ⚠️ Restricciones Críticas de Memoria (Raspberry Pi 5)

### Contexto Real
La RPi 5 tiene **otros servicios corriendo** y solo dispone de:
- **Normal:** 1-2GB de RAM libres
- **En picos:** Menos de 1GB libre

### Estrategias de Optimización OBLIGATORIAS

#### Backend (Hono + SQLite)
```typescript
// config/memory.config.ts
export const MEMORY_CONFIG = {
  sqlite: {
    journalMode: 'WAL',
    cacheSize: -2000,        // 2MB cache máximo
    mmapSize: 67108864,      // 64MB mmap
    pageSize: 4096,
    tempStore: 'memory',
    synchronous: 'normal',
  },
  server: {
    maxRequestBodySize: '512kb',  // Reducido de 1MB
    maxHeaderSize: 4096,
    keepAliveTimeout: 5000,
    headersTimeout: 10000,
  },
  pool: {
    maxConnections: 3,       // Mínimo absoluto
    idleTimeout: 15000,
    acquireTimeout: 3000,
  },
  cache: {
    maxSize: 30,             // Solo 30 items en cache
    ttl: 180000,             // 3 minutos
    checkPeriod: 30000,
  },
};
```

#### Frontend (Angular) - Presupuestos Estrictos
```json
// angular.json budgets
{
  "budgets": [
    { "type": "initial", "maximumWarning": "150kb", "maximumError": "200kb" },
    { "type": "anyComponentStyle", "maximumWarning": "3kb", "maximumError": "5kb" },
    { "type": "bundle", "name": "vendor", "maximumWarning": "100kb", "maximumError": "150kb" }
  ]
}
```

#### Docker - Límites Agresivos
```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1.0'          # Dejar CPU para otros servicios
          memory: 384M         # Límite MUY estricto
        reservations:
          cpus: '0.25'
          memory: 96M
    environment:
      - NODE_OPTIONS=--max-old-space-size=256
      - UV_THREADPOOL_SIZE=2
      - NODE_ENV=production
```

#### Monitoreo de Memoria
```typescript
// health endpoint con métricas
app.get('/health', (c) => {
  const mem = process.memoryUsage();
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const usagePercent = Math.round((1 - freeMem / totalMem) * 100);
  
  return c.json({
    status: usagePercent > 90 ? 'critical' : usagePercent > 80 ? 'warning' : 'ok',
    memory: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
      systemFree: Math.round(freeMem / 1024 / 1024) + 'MB',
      systemUsage: usagePercent + '%',
    },
  });
});
```

### Checklist de Optimización RPi
- [ ] SQLite en modo WAL
- [ ] Connection pooling limitado (max 3)
- [ ] Request body limit 512KB
- [ ] Cache limitado (30 items, TTL 3 min)
- [ ] Node.js heap limit 256MB
- [ ] Angular lazy loading + budgets estrictos
- [ ] Service Worker para cache offline
- [ ] Compresión Gzip/Brotli
- [ ] Image optimization (WebP, lazy loading)
- [ ] Docker memory limit 384MB
- [ ] Health checks cada 15s con métricas de memoria
- [ ] Pagination en todas las listas
- [ ] Streaming responses para IA
- [ ] Query optimization con índices SQLite
- [ ] Garbage collection manual en momentos críticos

---

## 🎯 Objetivos del Proyecto

### Objetivo Principal
Crear una aplicación de gestión de recetas de cocina con IA integrada que permita:
- Gestión inteligente de despensa y utensilios
- Generación personalizada de recetas basada en preferencias
- Planificación semanal automática con objetivos nutricionales
- Experiencia de usuario adaptativa según nivel de cocina

### Objetivos Secundarios
- Rendimiento óptimo en hardware limitado (Raspberry Pi 5)
- Arquitectura modular y reutilizable
- Código limpio con estándares estrictos de calidad
- Experiencia offline-first con sincronización

---

## 🏗️ Arquitectura del Sistema

### 1. Frontend (Angular 19+)

#### 1.1 Estructura de Componentes
```
src/
├── app/
│   ├── core/                    # Singleton services, guards, interceptors
│   │   ├── services/
│   │   │   ├── ai.service.ts           # Comunicación con API de IA
│   │   │   ├── pantry.service.ts       # Gestión de despensa
│   │   │   ├── recipe.service.ts       # Gestión de recetas
│   │   │   ├── household.service.ts    # Gestión del hogar
│   │   │   ├── calendar.service.ts     # Planificación semanal
│   │   │   └── auth.service.ts         # Autenticación multi-usuario
│   │   ├── guards/
│   │   │   └── auth.guard.ts
│   │   └── interceptors/
│   │       └── ai.interceptor.ts       # Intercepta llamadas a IA
│   │
│   ├── shared/                  # Componentes reutilizables
│   │   ├── components/
│   │   │   ├── ui/              # Componentes UI base
│   │   │   │   ├── button/
│   │   │   │   ├── card/
│   │   │   │   ├── input/
│   │   │   │   ├── modal/
│   │   │   │   ├── timer/
│   │   │   │   └── loading/
│   │   │   ├── recipe/          # Componentes de receta
│   │   │   │   ├── recipe-card/
│   │   │   │   ├── recipe-detail/
│   │   │   │   ├── ingredient-list/
│   │   │   │   ├── cooking-timer/
│   │   │   │   └── step-by-step/
│   │   │   ├── pantry/          # Componentes de despensa
│   │   │   │   ├── pantry-item/
│   │   │   │   ├── pantry-list/
│   │   │   │   └── pantry-add/
│   │   │   └── household/       # Componentes del hogar
│   │   │       ├── member-card/
│   │   │       ├── preferences-form/
│   │   │       └── allergies-manager/
│   │   ├── pipes/
│   │   │   ├── difficulty.pipe.ts
│   │   │   ├── time-format.pipe.ts
│   │   │   └── servings.pipe.ts
│   │   ├── directives/
│   │   │   ├── auto-resize.directive.ts
│   │   │   └── swipe.directive.ts
│   │   └── models/              # Interfaces y tipos
│   │       ├── recipe.model.ts
│   │       ├── pantry.model.ts
│   │       ├── household.model.ts
│   │       ├── ai-config.model.ts
│   │       └── calendar.model.ts
│   │
│   ├── features/                # Módulos lazy-loaded
│   │   ├── pantry/
│   │   │   ├── pantry.component.ts
│   │   │   ├── pantry.routes.ts
│   │   │   └── components/
│   │   │       ├── pantry-dashboard/
│   │   │       ├── pantry-search/
│   │   │       └── pantry-stats/
│   │   │
│   │   ├── recipes/
│   │   │   ├── recipes.component.ts
│   │   │   ├── recipes.routes.ts
│   │   │   └── components/
│   │   │       ├── recipe-list/
│   │   │       ├── recipe-detail/
│   │   │       ├── recipe-generator/
│   │   │       └── recipe-comparison/
│   │   │
│   │   ├── household/
│   │   │   ├── household.component.ts
│   │   │   ├── household.routes.ts
│   │   │   └── components/
│   │   │       ├── members-list/
│   │   │       ├── member-profile/
│   │   │       └── shared-house/
│   │   │
│   │   ├── calendar/
│   │   │   ├── calendar.component.ts
│   │   │   ├── calendar.routes.ts
│   │   │   └── components/
│   │   │       ├── weekly-view/
│   │   │       ├── meal-planner/
│   │   │       └── goals-manager/
│   │   │
│   │   ├── ai-config/
│   │   │   ├── ai-config.component.ts
│   │   │   ├── ai-config.routes.ts
│   │   │   └── components/
│   │   │       ├── provider-form/
│   │   │       ├── model-selector/
│   │   │       └── test-connection/
│   │   │
│   │   └── settings/
│   │       ├── settings.component.ts
│   │       ├── settings.routes.ts
│   │       └── components/
│   │           ├── general-settings/
│   │           ├── export-import/
│   │           └── about/
│   │
│   └── layouts/
│       ├── main-layout/
│       │   ├── main-layout.component.ts
│       │   ├── header/
│       │   ├── sidebar/
│       │   └── footer/
│       └── auth-layout/
│           └── auth-layout.component.ts
│
├── assets/
│   ├── styles/
│   │   ├── _variables.scss      # Variables CSS globales
│   │   ├── _mixins.scss         # Mixins reutilizables
│   │   ├── _typography.scss     # Tipografía
│   │   ├── _colors.scss        # Paleta de colores
│   │   └── _animations.scss    # Animaciones
│   ├── icons/
│   └── images/
│
├── environments/
│   ├── environment.ts
│   └── environment.prod.ts
│
└── styles.scss                # Estilos globales
```

#### 1.2 Sistema de Diseño (CSS Variables)

```scss
// _variables.scss
:root {
  // Colores primarios
  --color-primary: #FF6B35;
  --color-primary-light: #FF8A5C;
  --color-primary-dark: #E55A2B;
  
  // Colores secundarios
  --color-secondary: #4ECDC4;
  --color-secondary-light: #6ED5CE;
  --color-secondary-dark: #3DBDB4;
  
  // Colores de acento
  --color-accent: #FFE66D;
  --color-accent-light: #FFEB8B;
  --color-accent-dark: #FFD93D;
  
  // Colores neutros
  --color-background: #FAFAFA;
  --color-surface: #FFFFFF;
  --color-text-primary: #2D3436;
  --color-text-secondary: #636E72;
  --color-text-disabled: #B2BEC3;
  
  // Colores de estado
  --color-success: #00B894;
  --color-warning: #FDCB6E;
  --color-error: #D63031;
  --color-info: #0984E3;
  
  // Tipografía
  --font-family-primary: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-family-secondary: 'Poppins', sans-serif;
  --font-family-mono: 'Fira Code', monospace;
  
  // Tamaños de fuente
  --font-size-xs: 0.75rem;    // 12px
  --font-size-sm: 0.875rem;   // 14px
  --font-size-base: 1rem;     // 16px
  --font-size-lg: 1.125rem;   // 18px
  --font-size-xl: 1.25rem;    // 20px
  --font-size-2xl: 1.5rem;    // 24px
  --font-size-3xl: 1.875rem;  // 30px
  --font-size-4xl: 2.25rem;   // 36px
  
  // Espaciado
  --spacing-xs: 0.25rem;     // 4px
  --spacing-sm: 0.5rem;      // 8px
  --spacing-md: 1rem;        // 16px
  --spacing-lg: 1.5rem;      // 24px
  --spacing-xl: 2rem;        // 32px
  --spacing-2xl: 3rem;       // 48px
  
  // Bordes
  --border-radius-sm: 0.25rem;
  --border-radius-md: 0.5rem;
  --border-radius-lg: 1rem;
  --border-radius-full: 9999px;
  
  // Sombras
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  --shadow-xl: 0 20px 25px rgba(0,0,0,0.15);
  
  // Transiciones
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;
  --transition-slow: 500ms ease;
  
  // Breakpoints (para referencia)
  --breakpoint-mobile: 480px;
  --breakpoint-tablet: 768px;
  --breakpoint-desktop: 1024px;
  --breakpoint-wide: 1280px;
}
```

### 2. Backend (Hono + SQLite)

#### 2.1 Estructura del Servidor
```
server/
├── src/
│   ├── index.ts               # Entry point
│   ├── app.ts                 # Configuración de Hono
│   │
│   ├── config/
│   │   ├── database.ts        # Configuración SQLite
│   │   ├── ai-provider.ts     # Configuración de IA
│   │   └── app.config.ts      # Configuración general
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts  # Autenticación JWT
│   │   ├── cors.middleware.ts  # CORS
│   │   ├── rate-limit.middleware.ts  # Rate limiting
│   │   └── validation.middleware.ts  # Validación Zod
│   │
│   ├── routes/
│   │   ├── index.ts
│   │   ├── auth.routes.ts
│   │   ├── pantry.routes.ts
│   │   ├── recipes.routes.ts
│   │   ├── household.routes.ts
│   │   ├── calendar.routes.ts
│   │   └── ai.routes.ts
│   │
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── pantry.controller.ts
│   │   ├── recipes.controller.ts
│   │   ├── household.controller.ts
│   │   ├── calendar.controller.ts
│   │   └── ai.controller.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── pantry.service.ts
│   │   ├── recipes.service.ts
│   │   ├── household.service.ts
│   │   ├── calendar.service.ts
│   │   └── ai.service.ts
│   │
│   ├── models/
│   │   ├── user.model.ts
│   │   ├── pantry.model.ts
│   │   ├── recipe.model.ts
│   │   ├── household.model.ts
│   │   └── calendar.model.ts
│   │
│   ├── schemas/               # Esquemas Zod
│   │   ├── auth.schema.ts
│   │   ├── pantry.schema.ts
│   │   ├── recipe.schema.ts
│   │   ├── household.schema.ts
│   │   ├── calendar.schema.ts
│   │   └── ai.schema.ts
│   │
│   ├── utils/
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   ├── helpers.ts
│   │   └── validators.ts
│   │
│   └── types/
│       ├── index.ts
│       └── global.d.ts
│
├── database/
│   ├── migrations/
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_pantry.sql
│   │   ├── 003_create_recipes.sql
│   │   ├── 004_create_household.sql
│   │   └── 005_create_calendar.sql
│   └── seeds/
│       ├── ingredients.sql
│       ├── utensils.sql
│       └── sample_recipes.sql
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   └── utils/
│   ├── integration/
│   │   ├── routes/
│   │   └── database/
│   └── fixtures/
│
├── package.json
├── tsconfig.json
├── drizzle.config.ts          # ORM para SQLite
└── .env.example
```

#### 2.2 Esquemas Zod para IA

```typescript
// schemas/ai.schema.ts
import { z } from 'zod';

// Esquema para configuración de IA
export const aiConfigSchema = z.object({
  provider: z.enum(['openai', 'custom']),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(4096).default(2000),
  timeout: z.number().min(1000).max(60000).default(30000),
});

// Esquema para solicitud de receta
export const recipeRequestSchema = z.object({
  ingredients: z.array(z.object({
    id: z.string(),
    name: z.string(),
    quantity: z.number(),
    unit: z.string(),
  })).min(1),
  utensils: z.array(z.object({
    id: z.string(),
    name: z.string(),
    available: z.boolean(),
  })),
  servings: z.number().min(1).max(20),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  detailLevel: z.enum(['basic', 'intermediate', 'expert']),
  dietaryRestrictions: z.array(z.string()),
  allergies: z.array(z.string()),
  preferences: z.array(z.string()),
  cookingTime: z.object({
    min: z.number(),
    max: z.number(),
  }).optional(),
});

// Esquema para respuesta de receta de IA
export const aiRecipeResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  totalTime: z.number(), // minutos
  prepTime: z.number(),
  cookTime: z.number(),
  servings: z.number(),
  calories: z.number().optional(),
  ingredients: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    unit: z.string(),
    preparation: z.string().optional(), // "picado fino", "rallado", etc.
    notes: z.string().optional(),
  })),
  utensils: z.array(z.string()),
  steps: z.array(z.object({
    stepNumber: z.number(),
    instruction: z.string(),
    duration: z.number().optional(), // minutos
    tips: z.string().optional(),
    warning: z.string().optional(),
  })),
  nutrition: z.object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
    fiber: z.number().optional(),
  }).optional(),
  storage: z.object({
    method: z.string(),
    duration: z.string(),
    reheating: z.string().optional(),
  }).optional(),
  restTime: z.number().optional(), // minutos de reposo
  difficultyNotes: z.string().optional(),
});

// Esquema para planificación semanal
export const weeklyPlanSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meals: z.array(z.object({
    date: z.string(),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
    recipeId: z.string().optional(),
    customMeal: z.string().optional(),
    notes: z.string().optional(),
  })),
  goals: z.object({
    type: z.enum(['balanced', 'weight-loss', 'weight-gain', 'variety', 'custom']),
    caloriesTarget: z.number().optional(),
    proteinTarget: z.number().optional(),
    restrictions: z.array(z.string()),
  }),
});

// Esquema para recomendación de IA
export const aiRecommendationSchema = z.object({
  recentMeals: z.array(z.object({
    date: z.string(),
    meal: z.string(),
    recipeId: z.string().optional(),
  })),
  availableIngredients: z.array(z.string()),
  householdPreferences: z.object({
    likes: z.array(z.string()),
    dislikes: z.array(z.string()),
    allergies: z.array(z.string()),
  }),
  goals: z.object({
    type: z.string(),
    target: z.number().optional(),
  }),
  count: z.number().min(1).max(5).default(3),
});

// Tipos inferidos
export type AIConfig = z.infer<typeof aiConfigSchema>;
export type RecipeRequest = z.infer<typeof recipeRequestSchema>;
export type AIRecipeResponse = z.infer<typeof aiRecipeResponseSchema>;
export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>;
export type AIRecommendation = z.infer<typeof aiRecommendationSchema>;
```

---

## 📱 Características Detalladas

### 1. Gestión de Despensa

#### 1.1 Funcionalidades
- **Agregar ingredientes** con:
  - Nombre (con autocompletado)
  - Cantidad
  - Unidad de medida
  - Fecha de caducidad (opcional)
  - Categoría (lácteos, carnes, verduras, etc.)
  - Ubicación (nevera, congelador, despensa)
  - Foto (opcional)

- **Alertas inteligentes:**
  - Próximos a caducar
  - Stock bajo
  - Sugiere recetas con ingredientes próximos a caducar

- **Estadísticas:**
  - Valor nutricional total disponible
  - Distribución por categorías
  - Historial de consumo

#### 1.2 Modelos de Datos

```typescript
// pantry.model.ts
export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  quantity: number;
  unit: MeasurementUnit;
  expirationDate?: Date;
  location: StorageLocation;
  image?: string;
  barcode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IngredientCategory = 
  | 'dairy' | 'meat' | 'fish' | 'vegetables' 
  | 'fruits' | 'grains' | 'spices' | 'condiments'
  | 'frozen' | 'canned' | 'beverages' | 'other';

export type MeasurementUnit = 
  | 'g' | 'kg' | 'ml' | 'l' 
  | 'cup' | 'tbsp' | 'tsp' 
  | 'unit' | 'bunch' | 'slice' | 'piece';

export type StorageLocation = 
  | 'fridge' | 'freezer' | 'pantry' | 'counter';

export interface Utensil {
  id: string;
  name: string;
  category: UtensilCategory;
  available: boolean;
  notes?: string;
}

export type UtensilCategory = 
  | 'oven' | 'microwave' | 'airfryer' | 'stovetop'
  | 'blender' | 'mixer' | 'food-processor'
  | 'cookware' | 'bakeware' | 'tools';
```

### 2. Gestión del Hogar

#### 2.1 Miembros del Hogar

```typescript
// household.model.ts
export interface HouseholdMember {
  id: string;
  name: string;
  role: 'admin' | 'member' | 'child';
  cookingLevel: 'beginner' | 'intermediate' | 'expert';
  preferences: FoodPreferences;
  allergies: Allergy[];
  dislikes: string[];
  avatar?: string;
}

export interface FoodPreferences {
  dietType: 'omnivore' | 'vegetarian' | 'vegan' | 'pescatarian' | 'keto' | 'paleo';
  cuisinePreferences: string[]; // ["italian", "mexican", "asian"]
  spiceTolerance: 'low' | 'medium' | 'high';
  portionSize: 'small' | 'medium' | 'large';
}

export interface Allergy {
  id: string;
  name: string;
  severity: 'mild' | 'moderate' | 'severe';
  notes?: string;
}

export interface Household {
  id: string;
  name: string;
  inviteCode: string;
  members: HouseholdMember[];
  sharedPantry: boolean;
  createdAt: Date;
}
```

### 3. Recetas

#### 3.1 Modelo de Receta Completo

```typescript
// recipe.model.ts
export interface Recipe {
  id: string;
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  cuisine: string;
  mealType: MealType[];
  totalTime: number; // minutos
  prepTime: number;
  cookTime: number;
  restTime?: number;
  servings: number;
  calories?: number;
  image?: string;
  
  ingredients: RecipeIngredient[];
  utensils: string[];
  steps: RecipeStep[];
  nutrition?: NutritionInfo;
  storage?: StorageInfo;
  
  author: 'ai' | 'user';
  authorId?: string;
  rating?: number;
  timesCooked: number;
  
  tags: string[];
  isFavorite: boolean;
  isPublic: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipeIngredient {
  ingredientId?: string; // Referencia a despensa
  name: string;
  quantity: number;
  unit: MeasurementUnit;
  preparation?: string; // "picado fino", "rallado", etc.
  isOptional: boolean;
  substitutes?: string[];
  notes?: string;
}

export interface RecipeStep {
  stepNumber: number;
  instruction: string;
  duration?: number; // minutos
  temperature?: {
    value: number;
    unit: 'C' | 'F';
  };
  timerRequired: boolean;
  timerDuration?: number;
  tips?: string;
  warning?: string;
  image?: string;
}

export interface NutritionInfo {
  calories: number;
  protein: number; // g
  carbs: number; // g
  fat: number; // g
  fiber: number; // g
  sugar?: number; // g
  sodium?: number; // mg
}

export interface StorageInfo {
  method: string;
  container: string;
  duration: string;
  reheatingInstructions?: string;
  freezingPossible: boolean;
  freezingDuration?: string;
}
```

### 4. Calendario Semanal

#### 4.1 Planificación

```typescript
// calendar.model.ts
export interface WeeklyCalendar {
  id: string;
  householdId: string;
  weekStart: Date;
  weekEnd: Date;
  days: DayPlan[];
  goals: NutritionalGoals;
  generatedBy: 'user' | 'ai';
  createdAt: Date;
}

export interface DayPlan {
  date: Date;
  meals: Meal[];
  totalCalories: number;
  notes?: string;
}

export interface Meal {
  id: string;
  type: MealType;
  recipe?: Recipe;
  customMeal?: string;
  time?: string; // HH:mm
  servings: number;
  notes?: string;
  completed: boolean;
}

export type MealType = 
  | 'breakfast' | 'brunch' | 'lunch' 
  | 'snack' | 'dinner' | 'dessert';

export interface NutritionalGoals {
  type: GoalType;
  dailyCalories?: number;
  dailyProtein?: number;
  dailyCarbs?: number;
  dailyFat?: number;
  restrictions: string[];
  customGoals?: CustomGoal[];
}

export type GoalType = 
  | 'balanced' | 'weight-loss' | 'weight-gain' 
  | 'muscle-gain' | 'maintenance' | 'variety' | 'custom';

export interface CustomGoal {
  name: string;
  target: number;
  unit: string;
  frequency: 'daily' | 'weekly';
}
```

### 5. Configuración de IA

#### 5.1 Interfaz de Configuración

```typescript
// ai-config.model.ts
export interface AIProviderConfig {
  id: string;
  name: string;
  provider: 'openai' | 'custom';
  baseUrl: string;
  apiKey: string; // Encriptado en storage
  model: string;
  
  // Parámetros del modelo
  temperature: number;
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  
  // Timeouts
  timeout: number;
  retryAttempts: number;
  
  // Estado
  isActive: boolean;
  lastTested?: Date;
  testStatus?: 'success' | 'failed' | 'pending';
  testError?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface AIRequestConfig {
  recipeGeneration: {
    detailLevel: 'basic' | 'intermediate' | 'expert';
    includeNutrition: boolean;
    includeStorage: boolean;
    includeAlternatives: boolean;
    language: string;
  };
  weeklyPlanning: {
    considerSeasonal: boolean;
    varietyWeight: number; // 0-1
    budgetConsideration: boolean;
    leftoverReuse: boolean;
  };
  recommendations: {
    basedOnHistory: boolean;
    historyDays: number;
    considerPreferences: boolean;
    suggestNew: boolean;
  };
}
```

---

## 🧪 Estrategia de Testing

### 1. Stack de Testing

```json
// package.json (devDependencies)
{
  "devDependencies": {
    "@angular/core": "^19.0.0",
    "@angular/cli": "^19.0.0",
    "@angular/compiler-cli": "^19.0.0",
    
    // Testing Angular
    "@angular-devkit/build-angular": "^19.0.0",
    "karma": "^6.4.0",
    "karma-chrome-launcher": "^3.2.0",
    "karma-coverage": "^2.2.0",
    "karma-jasmine": "^5.1.0",
    "karma-jasmine-html-reporter": "^2.1.0",
    "jasmine-core": "^5.1.0",
    
    // E2E Testing
    "@playwright/test": "^1.40.0",
    
    // Code Quality
    "eslint": "^8.50.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint-plugin-angular": "^4.1.0",
    
    // Unused Code Detection
    "knip": "^2.0.0",
    
    // Coverage
    "istanbul": "^0.4.5",
    "nyc": "^15.1.0"
  }
}
```

### 2. Configuración de Coverage

```javascript
// karma.conf.js
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: {},
      clearContext: false
    },
    jasmineHtmlReporter: {
      suppressAll: true
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [
        { type: 'html' },
        { type: 'text-summary' },
        { type: 'lcov' }
      ],
      check: {
        global: {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100
        }
      }
    },
    reporters: ['progress', 'kjhtml', 'coverage'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['ChromeHeadless'],
    singleRun: true,
    restartOnFileChange: true
  });
};
```

### 3. Playwright E2E Tests

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:4200',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 4. Ejemplo de Tests E2E

```typescript
// e2e/pantry.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Pantry Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pantry');
    await page.waitForLoadState('networkidle');
  });

  test('should add a new ingredient', async ({ page }) => {
    await page.click('[data-testid="add-ingredient-btn"]');
    
    await page.fill('[data-testid="ingredient-name"]', 'Tomate');
    await page.fill('[data-testid="ingredient-quantity"]', '500');
    await page.selectOption('[data-testid="ingredient-unit"]', 'g');
    await page.selectOption('[data-testid="ingredient-category"]', 'vegetables');
    await page.selectOption('[data-testid="ingredient-location"]', 'fridge');
    
    await page.click('[data-testid="save-ingredient-btn"]');
    
    await expect(page.locator('.ingredient-item')).toContainText('Tomate');
    await expect(page.locator('.ingredient-quantity')).toContainText('500g');
  });

  test('should show expiration warning', async ({ page }) => {
    // Agregar ingrediente que caduca mañana
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    await page.click('[data-testid="add-ingredient-btn"]');
    await page.fill('[data-testid="ingredient-name"]', 'Leche');
    await page.fill('[data-testid="ingredient-quantity"]', '1');
    await page.selectOption('[data-testid="ingredient-unit"]', 'l');
    await page.fill('[data-testid="ingredient-expiration"]', tomorrow.toISOString().split('T')[0]);
    
    await page.click('[data-testid="save-ingredient-btn"]');
    
    await expect(page.locator('.expiration-warning')).toBeVisible();
    await expect(page.locator('.expiration-warning')).toContainText('caduca mañana');
  });

  test('should filter ingredients by category', async ({ page }) => {
    // Agregar varios ingredientes
    await addIngredient(page, 'Tomate', 'vegetables');
    await addIngredient(page, 'Leche', 'dairy');
    await addIngredient(page, 'Pollo', 'meat');
    
    // Filtrar por verduras
    await page.click('[data-testid="filter-vegetables"]');
    
    const items = page.locator('.ingredient-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('Tomate');
  });

  test('should validate required fields', async ({ page }) => {
    await page.click('[data-testid="add-ingredient-btn"]');
    await page.click('[data-testid="save-ingredient-btn"]');
    
    await expect(page.locator('.error-message')).toContainText('Nombre es requerido');
    await expect(page.locator('.error-message')).toContainText('Cantidad es requerida');
  });
});

// e2e/recipe-generation.spec.ts
test.describe('AI Recipe Generation', () => {
  test('should generate recipe from pantry ingredients', async ({ page }) => {
    await page.goto('/recipes/generate');
    
    // Seleccionar ingredientes de la despensa
    await page.click('[data-testid="ingredient-tomate"]');
    await page.click('[data-testid="ingredient-pasta"]');
    await page.click('[data-testid="ingredient-ajo"]');
    
    // Configurar opciones
    await page.selectOption('[data-testid="difficulty"]', 'easy');
    await page.selectOption('[data-testid="servings"]', '4');
    await page.selectOption('[data-testid="detail-level"]', 'intermediate');
    
    await page.click('[data-testid="generate-recipe-btn"]');
    
    // Esperar respuesta de IA
    await page.waitForSelector('[data-testid="recipe-result"]', { timeout: 30000 });
    
    await expect(page.locator('[data-testid="recipe-name"]')).not.toBeEmpty();
    await expect(page.locator('[data-testid="recipe-steps"]')).not.toBeEmpty();
    await expect(page.locator('[data-testid="recipe-ingredients"]')).toContainText('Tomate');
  });

  test('should show 3 recipe options', async ({ page }) => {
    await page.goto('/recipes/generate');
    
    await page.click('[data-testid="ingredient-tomate"]');
    await page.click('[data-testid="generate-multiple-btn"]');
    
    await page.waitForSelector('[data-testid="recipe-option-1"]', { timeout: 30000 });
    
    await expect(page.locator('[data-testid="recipe-option-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="recipe-option-2"]')).toBeVisible();
    await expect(page.locator('[data-testid="recipe-option-3"]')).toBeVisible();
  });
});
```

### 5. ESLint Configuration

```json
// .eslintrc.json
{
  "root": true,
  "ignorePatterns": ["projects/**/*"],
  "overrides": [
    {
      "files": ["*.ts"],
      "parserOptions": {
        "project": ["tsconfig.json"],
        "createDefaultProgram": true
      },
      "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@angular-eslint/recommended",
        "plugin:@angular-eslint/template/process-inline-templates"
      ],
      "rules": {
        // Tamaño de funciones
        "max-lines-per-function": ["error", { 
          "max": 50, 
          "skipBlankLines": true, 
          "skipComments": true 
        }],
        
        // Complejidad ciclomática
        "complexity": ["error", 10],
        
        // Profundidad de anidamiento
        "max-depth": ["error", 3],
        
        // Número de parámetros
        "max-params": ["error", 4],
        
        // Líneas por archivo
        "max-lines": ["error", { 
          "max": 300, 
          "skipBlankLines": true, 
          "skipComments": true 
        }],
        
        // Nomenclatura
        "@typescript-eslint/naming-convention": [
          "error",
          { "selector": "default", "format": ["camelCase"] },
          { "selector": "variable", "format": ["camelCase", "UPPER_CASE"] },
          { "selector": "parameter", "format": ["camelCase"], "leadingUnderscore": "allow" },
          { "selector": "memberLike", "modifiers": ["private"], "format": ["camelCase"], "leadingUnderscore": "require" },
          { "selector": "typeLike", "format": ["PascalCase"] },
          { "selector": "interface", "format": ["PascalCase"], "prefix": ["I"] },
          { "selector": "enum", "format": ["PascalCase"] },
          { "selector": "enumMember", "format": ["UPPER_CASE"] }
        ],
        
        // Orden de imports
        "import/order": ["error", {
          "groups": [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index"
          ],
          "newlines-between": "always",
          "alphabetize": { "order": "asc" }
        }],
        
        // Otros
        "no-console": ["error", { "allow": ["warn", "error"] }],
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
        "prefer-const": "error",
        "no-var": "error",
        "eqeqeq": ["error", "always"],
        "curly": ["error", "all"]
      }
    },
    {
      "files": ["*.html"],
      "extends": ["plugin:@angular-eslint/template/recommended"],
      "rules": {
        "@angular-eslint/template/no-negated-async": "error",
        "@angular-eslint/template/eqeqeq": "error",
        "@angular-eslint/template/no-any": "error",
        "@angular-eslint/template/accessibility-elements-content": "error",
        "@angular-eslint/template/accessibility-label-for": "error",
        "@angular-eslint/template/mouse-events-have-key-events": "error",
        "@angular-eslint/template/click-events-have-key-events": "error"
      }
    }
  ]
}
```

### 6. Knip Configuration

```json
// knip.json
{
  "$schema": "https://unpkg.com/knip@schema.json",
  "entry": [
    "src/main.ts",
    "src/polyfills.ts",
    "server/src/index.ts"
  ],
  "project": [
    "src/**/*.ts",
    "server/**/*.ts"
  ],
  "ignore": [
    "**/*.spec.ts",
    "**/*.test.ts",
    "**/test/**",
    "**/tests/**"
  ],
  "ignoreDependencies": [
    "@angular/compiler-cli",
    "@angular-devkit/build-angular",
    "karma-*",
    "jasmine-*"
  ],
  "rules": {
    "classMembers": "warn",
    "dependencies": "error",
    "devDependencies": "warn",
    "optionalPeerDependencies": "warn",
    "unlisted": "error",
    "binaries": "error",
    "unresolved": "error",
    "exports": "error",
    "types": "error",
    "nsExports": "error",
    "nsTypes": "error",
    "duplicates": "error"
  }
}
```

---

## 🚀 Despliegue en Raspberry Pi 5

### 1. Docker Compose Optimizado

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - NODE_ENV=production
    container_name: recipeapp
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/recipeapp.db
      - LOG_LEVEL=warn
      - NODE_OPTIONS=--max-old-space-size=256
      - UV_THREADPOOL_SIZE=2
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 20s
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 384M
        reservations:
          cpus: '0.25'
          memory: 96M

  # Nginx como reverse proxy (muy ligero)
  nginx:
    image: nginx:alpine
    container_name: recipeapp-nginx
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./dist:/usr/share/nginx/html:ro
    depends_on:
      app:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 64M
```

### 2. Dockerfile Multi-stage

```dockerfile
# Dockerfile
# Stage 1: Build Angular
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build:prod

# Stage 2: Build Backend
FROM node:20-alpine AS backend-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --only=production
COPY server/ .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

# Instalar dependencias de sistema mínimas
RUN apk add --no-cache \
    curl \
    tini \
    && rm -rf /var/cache/apk/*

# Copiar backend build
COPY --from=backend-build /app/server/dist ./server/dist
COPY --from=backend-build /app/server/node_modules ./server/node_modules
COPY --from=backend-build /app/server/package.json ./server/

# Copiar frontend build
COPY --from=frontend-build /app/dist ./public

# Copiar migraciones de base de datos
COPY server/database ./database

# Crear directorio de datos
RUN mkdir -p /app/data

# Configurar variables de entorno
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/recipeapp.db
ENV PORT=3000

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Usar tini como init system
ENTRYPOINT ["/sbin/tini", "--"]

# Iniciar aplicación
CMD ["node", "server/dist/index.js"]
```

### 3. Nginx Configuration

```nginx
# nginx/nginx.conf - Optimizado para RPi con RAM limitada
worker_processes 1;              # 1 worker para ahorrar RAM
pid /run/nginx.pid;
error_log /var/log/nginx/error.log warn;

events {
    worker_connections 512;      # Reducido
    multi_accept off;            # Ahorrar memoria
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    # Logging mínimo
    access_log off;              # Deshabilitar access log para ahorrar I/O
    error_log /var/log/nginx/error.log warn;
    
    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 30;
    types_hash_max_size 1024;
    client_max_body_size 512k;   # Limitar tamaño de request
    
    # Gzip (ahorra bandwidth, poco impacto en RAM)
    gzip on;
    gzip_vary on;
    gzip_comp_level 4;          # Reducido de 6
    gzip_min_length 256;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:5m rate=10r/s;
    
    # Upstream
    upstream backend {
        server app:3000;
        keepalive 8;             # Reducido de 32
    }
    
    server {
        listen 80;
        server_name _;
        
        # Security headers básicos
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        
        # Frontend (SPA)
        root /usr/share/nginx/html;
        index index.html;
        
        # API proxy
        location /api/ {
            limit_req zone=api burst=10 nodelay;
            
            proxy_pass http://backend/api/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header Connection "";
            
            # Timeouts
            proxy_connect_timeout 30s;
            proxy_send_timeout 60s;
            proxy_read_timeout 120s;  # IA puede tardar
        }
        
        # Health check
        location /health {
            proxy_pass http://backend/health;
            access_log off;
        }
        
        # Cache assets estáticos
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 7d;
            add_header Cache-Control "public, immutable";
        }
        
        # SPA fallback
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

### 4. Ejecución Directa en RPi (Sin Docker - Recomendado)

Docker consume ~50-100MB额外 RAM. Para RPi con RAM muy limitada, ejecutar directamente:

```bash
#!/bin/bash
# scripts/start.sh - Ejecutar directamente en RPi

# Configurar Node.js para usar mínima memoria
export NODE_OPTIONS="--max-old-space-size=256 --gc-interval=100"
export NODE_ENV=production
export UV_THREADPOOL_SIZE=2
export DATABASE_PATH="./data/recipeapp.db"

# Crear directorio de datos si no existe
mkdir -p ./data

# Ejecutar migraciones si es necesario
node server/dist/migrate.js

# Iniciar servidor con prioridad baja para no bloquear la RPi
nice -n 10 node server/dist/index.js &
SERVER_PID=$!

echo "RecipeApp started on port 3000 (PID: $SERVER_PID)"
echo "Memory limit: 256MB heap"

# Trap para shutdown limpio
trap "kill $SERVER_PID; exit" SIGTERM SIGINT
wait $SERVER_PID
```

```bash
# scripts/build.sh - Build optimizado para RPi
#!/bin/bash
set -e

echo "Building frontend..."
cd frontend
npm ci --production=false
npm run build:prod
cd ..

echo "Building backend..."
cd server
npm ci --production
npm run build
cd ..

echo "Copying frontend build to server/public..."
rm -rf server/public
cp -r frontend/dist server/public

echo "Build complete!"
echo "Run with: ./scripts/start.sh"
```

**Ventajas de ejecución directa:**
- Ahorra 50-100MB de RAM (sin overhead de Docker)
- Mejor rendimiento (sin capa de virtualización)
- Más simple de depurar
- Health checks integrados en el servidor

**Desventajas:**
- Sin aislamiento de procesos
- Dependencias del sistema (Node.js instalado)
- Sin auto-restart nativo (usar systemd)

### 5. Systemd Service (Para ejecución directa)

```ini
# /etc/systemd/system/recipeapp.service
[Unit]
Description=RecipeApp Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/recipeapp
ExecStart=/usr/bin/node server/dist/index.js
Restart=always
RestartSec=5

# Límites de memoria para systemd
MemoryLimit=384M
MemoryHigh=320M

# Variables de entorno
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=256
Environment=UV_THREADPOOL_SIZE=2
Environment=DATABASE_PATH=/home/pi/recipeapp/data/recipeapp.db

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=recipeapp

[Install]
WantedBy=multi-user.target
```

```bash
# Instalar y habilitar el servicio
sudo cp recipeapp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable recipeapp
sudo systemctl start recipeapp

# Ver logs
journalctl -u recipeapp -f

# Ver estado y uso de memoria
systemctl status recipeapp
```

---

## 📋 Checklist de Desarrollo (SDD)

### Fase 1: Configuración del Proyecto ✅

#### 1.1 Inicialización
- [ ] Crear repositorio Git
- [ ] Configurar Angular 19+ con SSR
- [ ] Configurar Hono server
- [ ] Configurar SQLite con Drizzle ORM
- [ ] Configurar ESLint con reglas estrictas
- [ ] Configurar Prettier
- [ ] Configurar Husky para pre-commit hooks
- [ ] Configurar Knip para detección de código no usado
- [ ] Configurar Playwright para E2E tests
- [ ] Configurar Karma/Jasmine para unit tests
- [ ] Configurar coverage con mínimo 100%
- [ ] Crear estructura de directorios
- [ ] Configurar path aliases

#### 1.2 Variables de Entorno y Configuración
- [ ] Crear sistema de configuración en UI (no .env)
- [ ] Implementar encriptación para tokens de IA
- [ ] Configurar CORS
- [ ] Configurar rate limiting
- [ ] Configurar logging

### Fase 2: Diseño UI/UX ✅

#### 2.1 Sistema de Diseño (Ver DESIGN-SYSTEM.md)
- [ ] Implementar paleta de colores cálidos (naranja + verde)
- [ ] Configurar modo oscuro
- [ ] Definir tipografía (Inter + Plus Jakarta Sans)
- [ ] Implementar sistema de espaciado (4px base)
- [ ] Crear variables CSS globales
- [ ] Crear mixins SCSS reutilizables
- [ ] Diseñar breakpoints responsive (mobile-first)
- [ ] Crear animaciones y transiciones
- [ ] Definir iconografía consistente (Lucide Icons)

#### 2.2 Componentes Base (Shared Module)
- [ ] Button component (variantes: primary, secondary, outline, icon)
- [ ] Input component (text, number, email, password, search)
- [ ] Select component (single, multi, searchable)
- [ ] Card component (recipe, ingredient, member)
- [ ] Modal component (confirm, alert, custom)
- [ ] Toast/Notification component
- [ ] Loading/Spinner component
- [ ] Timer component (countdown, stopwatch)
- [ ] Badge component (difficulty, category, status)
- [ ] Avatar component
- [ ] Tabs component
- [ ] Accordion component
- [ ] Dropdown component
- [ ] Tooltip component
- [ ] Progress bar component
- [ ] Rating component (stars)
- [ ] Tag/Chip component

#### 2.3 Layouts
- [ ] Main layout (header, sidebar, content, footer)
- [ ] Auth layout (login, register)
- [ ] Mobile navigation (bottom tab bar)
- [ ] Desktop navigation (sidebar)
- [ ] Responsive header con menú hamburguesa

### Fase 3: Autenticación y Gestión de Usuarios ✅

#### 3.1 Backend
- [ ] Modelo de datos User
- [ ] Schema de validación Zod
- [ ] Registro de usuarios
- [ ] Login con JWT
- [ ] Refresh tokens
- [ ] Recuperación de contraseña
- [ ] Middleware de autenticación
- [ ] Rate limiting por usuario

#### 3.2 Frontend
- [ ] Auth service
- [ ] Auth guard
- [ ] Auth interceptor
- [ ] Login page
- [ ] Register page
- [ ] Forgot password page
- [ ] Profile page
- [ ] Session management

### Fase 4: Gestión del Hogar ✅

#### 4.1 Backend
- [ ] Modelo de datos Household
- [ ] Modelo de datos HouseholdMember
- [ ] Schema de validación Zod
- [ ] CRUD Household
- [ ] CRUD Members
- [ ] Sistema de invitaciones (código)
- [ ] Roles y permisos
- [ ] Preferencias de comida
- [ ] Alergias y restricciones
- [ ] Nivel de cocina

#### 4.2 Frontend
- [ ] Household service
- [ ] Crear/Unirse a hogar
- [ ] Gestionar miembros
- [ ] Perfil de miembro
- [ ] Formulario de preferencias
- [ ] Gestión de alergias
- [ ] Selección de nivel de cocina
- [ ] Compartir despensa entre miembros

### Fase 5: Gestión de Despensa ✅

#### 5.1 Backend
- [ ] Modelo de datos Ingredient
- [ ] Modelo de datos Utensil
- [ ] Schema de validación Zod
- [ ] CRUD Ingredientes
- [ ] CRUD Utensilios
- [ ] Categorías predefinidas
- [ ] Unidades de medida
- [ ] Alertas de caducidad
- [ ] Búsqueda y filtrado
- [ ] Estadísticas de despensa
- [ ] Compartir entre miembros del hogar

#### 5.2 Frontend
- [ ] Pantry service
- [ ] Dashboard de despensa
- [ ] Lista de ingredientes
- [ ] Agregar/Editar ingrediente
- [ ] Categorías con iconos
- [ ] Filtros avanzados
- [ ] Búsqueda con autocompletado
- [ ] Alertas visuales de caducidad
- [ ] Gestión de utensilios
- [ ] Selector de utensilios para recetas

### Fase 6: Recetas ✅

#### 6.1 Backend
- [ ] Modelo de datos Recipe
- [ ] Modelo de datos RecipeStep
- [ ] Modelo de datos RecipeIngredient
- [ ] Schema de validación Zod
- [ ] CRUD Recetas
- [ ] Recetas predefinidas (seeds)
- [ ] Búsqueda y filtrado
- [ ] Favoritos
- [ ] Historial de cocción
- [ ] Rating y reseñas
- [ ] Ajuste de cantidades por personas

#### 6.2 Frontend
- [ ] Recipe service
- [ ] Lista de recetas
- [ ] Detalle de receta
- [ ] Paso a paso interactivo
- [ ] Cronómetros múltiples
- [ ] Ajuste de porciones
- [ ] Modo cocina (pantalla completa)
- [ ] Lista de compras automática
- [ ] Compartir recetas
- [ ] Historial de recetas cocinadas

### Fase 7: Integración con IA ✅

#### 7.1 Backend
- [ ] AI service con soporte OpenAI-like
- [ ] Esquemas Zod para respuestas de IA
- [ ] Validación estricta de respuestas
- [ ] Rate limiting de llamadas a IA
- [ ] Cache de respuestas
- [ ] Retry logic con backoff exponencial
- [ ] Logging de llamadas a IA
- [ ] Endpoints:
  - [ ] POST /api/ai/generate-recipe
  - [ ] POST /api/ai/recommend-recipes
  - [ ] POST /api/ai/plan-week
  - [ ] POST /api/ai/analyze-ingredients
  - [ ] POST /api/ai/test-connection

#### 7.2 Frontend
- [ ] AI service
- [ ] Configuración de proveedor de IA
  - [ ] Selector de proveedor (OpenAI/Custom)
  - [ ] Input para URL base
  - [ ] Input para API Key (enmascarado)
  - [ ] Selector de modelo
  - [ ] Parámetros avanzados (temperature, tokens, etc.)
  - [ ] Test de conexión
  - [ ] Guardar configuración
- [ ] Generador de recetas con IA
  - [ ] Selección de ingredientes
  - [ ] Selección de utensilios
  - [ ] Configuración de dificultad
  - [ ] Nivel de detalle
  - [ ] Restricciones dietéticas
  - [ ] Generar 1 o 3 opciones
  - [ ] Seleccionar y guardar receta
- [ ] Recomendaciones basadas en historial
- [ ] Planificación semanal automática

### Fase 8: Calendario y Planificación ✅

#### 8.1 Backend
- [ ] Modelo de datos WeeklyCalendar
- [ ] Modelo de datos Meal
- [ ] Modelo de datos NutritionalGoals
- [ ] Schema de validación Zod
- [ ] CRUD Calendario
- [ ] Planificación semanal
- [ ] Objetivos nutricionales
- [ ] Estadísticas semanales
- [ ] Exportar planificación

#### 8.2 Frontend
- [ ] Calendar service
- [ ] Vista semanal
- [ ] Planificador de comidas
- [ ] Drag & drop de recetas
- [ ] Selector de comida (desayuno, almuerzo, etc.)
- [ ] Gestión de objetivos
  - [ ] Dieta equilibrada
  - [ ] Perder peso
  - [ ] Ganar peso
  - [ ] Ganar músculo
  - [ ] Comida variada
  - [ ] Objetivos personalizados
- [ ] Planificación automática con IA
- [ ] Estadísticas nutricionales
- [ ] Recordatorios

### Fase 9: Testing y Calidad ✅

#### 9.1 Unit Tests (100% cobertura)
- [ ] Services
  - [ ] AuthService
  - [ ] PantryService
  - [ ] RecipeService
  - [ ] HouseholdService
  - [ ] CalendarService
  - [ ] AIService
- [ ] Components
  - [ ] Todos los componentes shared
  - [ ] Todos los componentes de features
- [ ] Pipes
  - [ ] DifficultyPipe
  - [ ] TimeFormatPipe
  - [ ] ServingsPipe
- [ ] Directives
  - [ ] AutoResizeDirective
  - [ ] SwipeDirective
- [ ] Guards
  - [ ] AuthGuard
- [ ] Interceptors
  - [ ] AIInterceptor
- [ ] Utils
  - [ ] Todas las funciones de utilidad

#### 9.2 Integration Tests
- [ ] API endpoints
  - [ ] Auth endpoints
  - [ ] Pantry endpoints
  - [ ] Recipe endpoints
  - [ ] Household endpoints
  - [ ] Calendar endpoints
  - [ ] AI endpoints
- [ ] Database operations
  - [ ] CRUD operations
  - [ ] Migrations
  - [ ] Seeds

#### 9.3 E2E Tests (Playwright)
- [ ] Flujos de usuario
  - [ ] Registro y login
  - [ ] Crear hogar e invitar miembros
  - [ ] Gestionar despensa completa
  - [ ] Generar receta con IA
  - [ ] Planificar semana
  - [ ] Cocinar receta con timers
  - [ ] Configurar proveedor de IA
- [ ] Responsive tests
  - [ ] Mobile (320px - 480px)
  - [ ] Tablet (481px - 768px)
  - [ ] Desktop (769px+)
- [ ] Accessibility tests
  - [ ] Keyboard navigation
  - [ ] Screen reader
  - [ ] Color contrast

#### 9.4 Code Quality
- [ ] ESLint sin errores
- [ ] Knip sin código no usado
- [ ] Prettier formateado
- [ ] Coverage 100%
- [ ] Bundle size bajo límites
- [ ] Lighthouse score > 90

### Fase 10: Optimización y Despliegue ✅

#### 10.1 Optimización de Memoria (CRÍTICO para RPi)
- [ ] Node.js heap limit a 256MB
- [ ] SQLite modo WAL configurado
- [ ] Connection pooling limitado (max 3)
- [ ] Cache en memoria limitado (30 items, TTL 3 min)
- [ ] Request body limit 512KB
- [ ] Angular budgets estrictos (150KB initial)
- [ ] Lazy loading de TODOS los módulos
- [ ] Tree shaking agresivo
- [ ] Code splitting por módulo
- [ ] Minificación de assets
- [ ] Compresión Gzip (level 4 para RPi)
- [ ] Image optimization (WebP, lazy loading)
- [ ] Service Worker para cache offline
- [ ] Pagination en todas las listas
- [ ] Streaming responses para IA

#### 10.2 PWA Features
- [ ] Service Worker
- [ ] Manifest.json
- [ ] Offline support
- [ ] Push notifications
- [ ] Install prompt
- [ ] Background sync

#### 10.3 Despliegue Raspberry Pi
- [ ] **Opción A: Docker** (más aislamiento, ~50MB extra RAM)
  - [ ] Docker Compose con límites de memoria (384MB)
  - [ ] Dockerfile multi-stage optimizado
  - [ ] Nginx como reverse proxy (64MB limit)
- [ ] **Opción B: Ejecución directa** (recomendado para RPi)
  - [ ] Script de inicio con Node.js optimizado
  - [ ] Systemd service configurado
  - [ ] Memory limits en systemd
- [ ] Health checks con métricas de memoria
- [ ] Backup automático de SQLite
- [ ] Logs rotation (máximo 10MB)
- [ ] Auto-restart en caso de fallo
- [ ] Monitoreo de RAM (alertas 80% y 90%)

#### 10.4 Documentación
- [ ] README.md completo
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Guía de instalación para RPi
- [ ] Guía de configuración de memoria
- [ ] Guía de desarrollo
- [ ] Changelog

---

## 📅 Estimación de Tiempo

| Fase | Descripción | Días Estimados |
|------|-------------|----------------|
| 1 | Configuración del proyecto | 2-3 |
| 2 | Diseño UI/UX | 3-4 |
| 3 | Autenticación | 2-3 |
| 4 | Gestión del Hogar | 3-4 |
| 5 | Gestión de Despensa | 3-4 |
| 6 | Recetas | 4-5 |
| 7 | Integración con IA | 4-5 |
| 8 | Calendario y Planificación | 3-4 |
| 9 | Testing y Calidad | 4-5 |
| 10 | Optimización y Despliegue | 3-4 |
| **Total** | | **31-41 días** |

---

## 🎯 Métricas de Éxito

### Rendimiento (Optimizado para RPi)
- [ ] First Contentful Paint < 2s (en RPi)
- [ ] Time to Interactive < 4s (en RPi)
- [ ] Lighthouse Performance > 80 (en RPi)
- [ ] Bundle size < 200KB (gzipped) - CRÍTICO para RPi
- [ ] API response time < 500ms (p95 en RPi)
- [ ] **Uso de RAM del servidor < 256MB** - CRÍTICO
- [ ] **Uso total de RAM (server+nginx) < 384MB** - CRÍTICO
- [ ] Docker image size < 200MB

### Calidad
- [ ] Code coverage: 100%
- [ ] ESLint errors: 0
- [ ] Knip unused code: 0
- [ ] Accessibility score: AA
- [ ] Security audit: pass

### Funcionalidad
- [ ] Todas las features implementadas
- [ ] Todos los tests pasando
- [ ] Responsive en todos los dispositivos
- [ ] Offline funcional (PWA)
- [ ] IA integrada y funcionando
- [ ] Health checks con métricas de memoria
- [ ] Alertas de memoria al 80% y 90%

---

## 🔧 Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo
npm run dev              # Inicia frontend y backend

# Testing
npm run test             # Unit tests
npm run test:watch       # Unit tests en modo watch
npm run test:coverage    # Unit tests con coverage
npm run e2e              # E2E tests con Playwright
npm run e2e:ui           # E2E tests con UI

# Code Quality
npm run lint             # ESLint
npm run lint:fix         # ESLint fix
npm run format           # Prettier
npm run knip             # Código no usado

# Build
npm run build            # Build producción
npm run build:prod       # Build optimizado

# Docker
docker-compose up -d     # Iniciar servicios
docker-compose down      # Detener servicios
docker-compose logs -f   # Ver logs
```

---

## 📚 Recursos y Referencias

### Documentación
- [Angular 19](https://angular.dev/)
- [Hono](https://hono.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Playwright](https://playwright.dev/)
- [Zod](https://zod.dev/)

### Diseño
- [Material Design 3](https://m3.material.io/)
- [Angular Material](https://material.angular.io/)
- [Tailwind CSS](https://tailwindcss.com/) (alternativa)

### Mejores Prácticas
- [Angular Style Guide](https://angular.dev/style-guide)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [TDD](https://martinfowler.com/articles/tdd.html)

---

**Última actualización:** 2026-09-13  
**Versión del SDD:** 1.0.0  
**Autor:** RecipeApp Team
