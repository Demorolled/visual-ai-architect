"""training.unlearn — selectively remove knowledge the model doesn't need.

The student only has to build apps. General world knowledge (history,
geography, literature, sport…) is dead weight in it: it costs capacity, and it
gives the model somewhere to wander instead of staying on the job.

The method here is **task-vector negation**, the most surgical option that
does not require retraining the 14B:

    1. Fine-tune a LoRA on the FORGET set. That produces a *task vector* `τ`
       that makes the model BETTER at the domain you want gone.
    2. Subtract it:  θ' = θ − λ·τ
       With LoRA that is exact and cheap — negate the `lora_B` matrices and
       scale by λ. λ=1 removes exactly the vector that was learned; λ>1
       over-subtracts (more removal, more collateral).

Why train *toward* the thing you want to remove? Because a task vector is only
meaningful if it points at the capability. Subtracting a direction the model
never learned does nothing.

Crucially this needs a RETAIN set too. Forgetting without measuring damage is
guesswork: every λ is scored on the forget set (want worse) AND the retain set
(want flat), and only λ values that hold retain damage under a threshold are
considered.

Modules:
    gguf_to_hf  dequantize a GGUF into a trainable HF checkpoint (the only copy of
                the deployed model is a Q4_K_M GGUF, which PEFT cannot train on)
    sets        build/validate the forget and retain sets
    negate      train the forget adapter, then produce λ-negated adapters
    evaluate    score forget/retain perplexity per λ and pick a winner
    inspect_gen read real generations — separates forgetting from incoherence,
                which perplexity alone cannot do
    npo         stronger alternative: NPO unlearning with a retain KL term
    preflight   what can run right now, and what is blocked

CLI:
    python3 -m training.unlearn -h
"""
