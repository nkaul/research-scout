import type { RetrievalState, ResourceLane, ResourceQuery } from '../../src/lib/conversations';

/** Authored shared-model-plan output for browser contracts; not a live model result. */
export function sharedPlanningFields(): Pick<RetrievalState, 'policy' | 'shared_plan' | 'resource_queries' | 'context_expansion' | 'needs_clarification'> {
  const resource_queries = Object.fromEntries((['papers', 'videos', 'datasets', 'repos'] as ResourceLane[]).map(lane => [lane, { lexical_query: `${lane} retrieval evaluation`, semantic_query: `Find ${lane} for evaluating retrieved evidence in language models`, query_terms: ['retrieval', 'question answering'], rationale: `An authored ${lane}-specific planning fixture.` }])) as Record<ResourceLane, ResourceQuery>;
  return { policy:'scout-agentic-retrieval-v7', shared_plan:{policy:'scout-agentic-retrieval-v7',model_step:'plan',fingerprint:'a'.repeat(64)}, resource_queries, context_expansion:{interpreted_question:'How can retrieved evidence improve language-model generation?',domain_basis:'inferred',inferred_context:['Language-model context is the intended research domain.'],missing_information:[{topic:'Evaluation task',question:'Which evaluation task or metric matters most?',essential:false}]}, needs_clarification:false };
}
