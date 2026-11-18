package com.azadari.kopaganj.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.azadari.kopaganj.data.ArchiveRepository
import com.azadari.kopaganj.data.ArchiveSnapshot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ArchiveUiState(
    val snapshot: ArchiveSnapshot? = null,
    val loading: Boolean = false,
    val error: String? = null
)

class ArchiveViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = ArchiveRepository(application)
    private val _state = MutableStateFlow(
        ArchiveUiState(snapshot = repository.loadCached())
    )
    val state: StateFlow<ArchiveUiState> = _state.asStateFlow()

    fun refresh(full: Boolean = true) {
        viewModelScope.launch {
            val current = _state.value.snapshot
            _state.value = _state.value.copy(
                loading = current == null,
                error = null
            )
            runCatching { if (full) repository.loadFull() else repository.load() }.fold(
                { _state.value = ArchiveUiState(snapshot = it) },
                { error ->
                    _state.value = if (current == null) {
                        ArchiveUiState(error = error.message ?: "Could not load archive")
                    } else {
                        ArchiveUiState(snapshot = current)
                    }
                }
            )
        }
    }
}
