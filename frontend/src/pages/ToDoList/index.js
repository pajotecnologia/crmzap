import React, { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import TextField from '@material-ui/core/TextField';
import Button from '@material-ui/core/Button';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction';
import IconButton from '@material-ui/core/IconButton';
import Tooltip from '@material-ui/core/Tooltip';
import { Pencil, Trash2, ListTodo } from 'lucide-react';
import MainContainer from '../../components/MainContainer';
import MainHeader from '../../components/MainHeader';
import Title from '../../components/Title';
import { ListEmptyState } from '../../components/ListStates';
import { getUiTokens } from '../../styles/uiTokens';

const useStyles = makeStyles((theme) => {
  const ui = getUiTokens(theme);
  return {
    root: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: theme.spacing(1, 1.5, 2),
      maxWidth: 920,
      width: '100%',
      boxSizing: 'border-box',
    },
    inputContainer: {
      display: 'flex',
      gap: 10,
      width: '100%',
      alignItems: 'stretch',
      [theme.breakpoints.down('xs')]: {
        flexDirection: 'column',
      },
    },
    input: {
      flexGrow: 1,
      minWidth: 0,
    },
    addButton: {
      flexShrink: 0,
      minHeight: 40,
      borderRadius: 10,
      boxShadow: 'none',
    },
    listContainer: {
      width: '100%',
      backgroundColor: theme.palette.background.paper,
      border: `1px solid ${ui.border}`,
      borderRadius: 14,
      overflow: 'hidden',
    },
    list: {
      padding: 0,
    },
    item: {
      gap: 12,
      minHeight: 56,
      paddingRight: 104,
      borderBottom: `1px solid ${ui.divider}`,
      color: theme.palette.text.primary,
      transition: 'background-color 0.12s ease',
      '&:last-child': { borderBottom: 'none' },
      '&:hover': { backgroundColor: ui.hoverBg },
    },
    itemEditing: {
      backgroundColor: ui.selectedBg,
      '&:hover': { backgroundColor: ui.selectedBg },
    },
    itemText: {
      minWidth: 0,
      '& .MuiListItemText-primary': {
        fontSize: '0.875rem',
        fontWeight: 500,
        overflowWrap: 'anywhere',
      },
      '& .MuiListItemText-secondary': {
        fontSize: '0.75rem',
        marginTop: 2,
      },
    },
    actions: {
      display: 'flex',
      gap: 2,
      right: 8,
    },
    actionDanger: {
      '&:hover': { color: theme.palette.error.main },
    },
  };
});

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR');
};

const ToDoList = () => {
  const classes = useStyles();

  const [task, setTask] = useState('');
  const [tasks, setTasks] = useState([]);
  const [editIndex, setEditIndex] = useState(-1);

  useEffect(() => {
    const savedTasks = localStorage.getItem('tasks');
    if (savedTasks) {
      setTasks(JSON.parse(savedTasks));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

  const handleTaskChange = (event) => {
    setTask(event.target.value);
  };

  const handleAddTask = () => {
    if (!task.trim()) {
      // Impede que o usuário crie uma tarefa sem texto
      return;
    }

    const now = new Date();
    if (editIndex >= 0) {
      // Editar tarefa existente
      const newTasks = [...tasks];
      newTasks[editIndex] = {text: task, updatedAt: now, createdAt: newTasks[editIndex].createdAt};
      setTasks(newTasks);
      setTask('');
      setEditIndex(-1);
    } else {
      // Adicionar nova tarefa
      setTasks([...tasks, {text: task, createdAt: now, updatedAt: now}]);
      setTask('');
    }
  };

  const handleEditTask = (index) => {
    setTask(tasks[index].text);
    setEditIndex(index);
  };

  const handleDeleteTask = (index) => {
    const newTasks = [...tasks];
    newTasks.splice(index, 1);
    setTasks(newTasks);
  };

  return (
    <MainContainer autoHeight>
      <MainHeader>
        <Title>Tarefas ({tasks.length})</Title>
      </MainHeader>
      <div className={classes.root}>
        <div className={classes.inputContainer}>
          <TextField
            className={classes.input}
            label="Nova tarefa"
            value={task}
            onChange={handleTaskChange}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
            variant="outlined"
            size="small"
          />
          <Button className={classes.addButton} variant="contained" color="primary" onClick={handleAddTask}>
            {editIndex >= 0 ? 'Salvar' : 'Adicionar'}
          </Button>
        </div>
        <div className={classes.listContainer}>
          {tasks.length === 0 ? (
            <ListEmptyState
              icon={ListTodo}
              title="Nenhuma tarefa ainda"
              description="Escreva uma tarefa acima e toque em Adicionar."
            />
          ) : (
            <List className={classes.list}>
              {tasks.map((task, index) => (
                <ListItem
                  key={index}
                  className={`${classes.item} ${editIndex === index ? classes.itemEditing : ''}`}
                >
                  <ListItemText
                    className={classes.itemText}
                    primary={task.text}
                    secondary={formatDate(task.updatedAt)}
                  />
                  <ListItemSecondaryAction className={classes.actions}>
                    <Tooltip title="Editar">
                      <IconButton aria-label="Editar tarefa" onClick={() => handleEditTask(index)}>
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Excluir">
                      <IconButton
                        aria-label="Excluir tarefa"
                        className={classes.actionDanger}
                        onClick={() => handleDeleteTask(index)}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </div>
      </div>
    </MainContainer>
  );
};


export default ToDoList;
