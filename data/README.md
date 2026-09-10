# Disease annotation data

Place the current HPO disease annotation file at `data/phenotype.hpoa`.
The application reads the tab-separated `database_id`, `disease_name`,
`qualifier`, and `hpo_id` columns. Annotations marked `NOT` are ignored.

Without this optional file, phenotype extraction still works, but disease
ranking is disabled.